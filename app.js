// Database management
let availableDatabases = [];
let currentDatabase = null;
let DATABASES = {}; // Will be populated from current database

let currentSteps = [];
let currentStepIndex = -1;
let parsedQuery = null;
let currentGraphMode = 'operation'; // 'operation' or 'execution'

// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'default' });

// Database file list
const DATABASE_FILES = [
    'databases/university.json',
    'databases/rpg.json',
    'databases/game-store.json',
    'databases/library.json'
];

// Generate and display database schema on page load
window.addEventListener('DOMContentLoaded', () => {
    loadAllDatabases();
});

// Load all database JSON files
async function loadAllDatabases() {
    availableDatabases = [];

    for (const file of DATABASE_FILES) {
        try {
            const response = await fetch(file);
            const database = await response.json();
            availableDatabases.push(database);
        } catch (error) {
            console.error(`Failed to load ${file}:`, error);
        }
    }

    // Populate dropdown
    const select = document.getElementById('databaseSelect');
    select.innerHTML = '';

    availableDatabases.forEach((db, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = db.name;
        select.appendChild(option);
    });

    // Load first database by default
    if (availableDatabases.length > 0) {
        select.value = 0;
        switchDatabase();
    }
}

// Switch to a different database
function switchDatabase() {
    const select = document.getElementById('databaseSelect');
    const index = parseInt(select.value);

    if (index >= 0 && index < availableDatabases.length) {
        currentDatabase = availableDatabases[index];
        DATABASES = currentDatabase.tables;

        // Update schema display
        displayDatabaseSchema();

        // Update examples
        updateExamples();

        // Reset query execution
        resetQuery();
    }
}

function displayDatabaseSchema() {
    if (!currentDatabase) return;

    let schemaDiagram;

    // Use provided Mermaid schema if available, otherwise auto-generate
    if (currentDatabase.mermaidSchema) {
        schemaDiagram = currentDatabase.mermaidSchema;
    } else {
        schemaDiagram = generateMermaidSchema(currentDatabase.tables);
    }

    const schemaContainer = document.getElementById('schemaDiagram');
    schemaContainer.innerHTML = '';

    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'mermaid';
    diagramDiv.textContent = schemaDiagram;
    schemaContainer.appendChild(diagramDiv);

    mermaid.run({ nodes: [diagramDiv] });
}

// Auto-generate Mermaid schema from table structure
function generateMermaidSchema(tables) {
    let schema = 'erDiagram\n';

    // Generate entity definitions
    for (const [tableName, rows] of Object.entries(tables)) {
        if (rows.length > 0) {
            schema += `    ${tableName} {\n`;
            const firstRow = rows[0];
            for (const [key, value] of Object.entries(firstRow)) {
                const type = typeof value === 'number' ? 'int' :
                            typeof value === 'boolean' ? 'boolean' : 'string';
                const isPK = key === 'id' || key.endsWith('_id');
                const suffix = isPK && key === 'id' ? ' PK' : isPK ? ' FK' : '';
                schema += `        ${type} ${key}${suffix}\n`;
            }
            schema += '    }\n';
        }
    }

    return schema;
}

// Update example queries based on current database
function updateExamples() {
    const examplesContainer = document.querySelector('.examples');
    const examplesDiv = examplesContainer.querySelector('div').parentElement;

    // Clear existing examples (except header)
    examplesDiv.innerHTML = '<h3>Example Queries (click to use):</h3>';

    // Add examples from database or use defaults
    const examples = currentDatabase.examples || [];

    examples.forEach((query, index) => {
        const div = document.createElement('div');
        div.className = 'example-query';
        div.textContent = query;
        div.onclick = () => loadExample(index);
        examplesDiv.appendChild(div);
    });
}

// Load custom database from file upload
function loadCustomDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const database = JSON.parse(e.target.result);

            // Validate database structure
            if (!database.name || !database.tables) {
                alert('Invalid database format. Must include "name" and "tables" fields.');
                return;
            }

            // Add to available databases
            availableDatabases.push(database);

            // Update dropdown
            const select = document.getElementById('databaseSelect');
            const option = document.createElement('option');
            option.value = availableDatabases.length - 1;
            option.textContent = database.name + ' (custom)';
            select.appendChild(option);

            // Switch to new database
            select.value = availableDatabases.length - 1;
            switchDatabase();

            alert(`Database "${database.name}" loaded successfully!`);
        } catch (error) {
            alert('Failed to load database: ' + error.message);
        }
    };
    reader.readAsText(file);

    // Reset file input
    event.target.value = '';
}

// Export current database as JSON
function exportCurrentDatabase() {
    if (!currentDatabase) {
        alert('No database loaded');
        return;
    }

    const json = JSON.stringify(currentDatabase, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentDatabase.name.toLowerCase().replace(/\s+/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Toggle schema visibility
function toggleSchema() {
    const schemaSection = document.getElementById('schemaSection');
    const toggleBtn = document.getElementById('schemaToggleBtn');

    if (schemaSection.classList.contains('hidden')) {
        schemaSection.classList.remove('hidden');
        toggleBtn.textContent = 'Hide Schema';
    } else {
        schemaSection.classList.add('hidden');
        toggleBtn.textContent = 'Show Schema';
    }
}

// Toggle format help visibility
function toggleFormatHelp() {
    const formatHelp = document.getElementById('formatHelp');
    const toggleBtn = document.getElementById('helpToggleBtn');

    if (formatHelp.classList.contains('hidden')) {
        formatHelp.classList.remove('hidden');
        toggleBtn.textContent = 'Hide Format Help';
    } else {
        formatHelp.classList.add('hidden');
        toggleBtn.textContent = 'Show Format Help';
    }
}

// Token types
const TOKEN_TYPES = {
    PROJECTION: 'π',
    SELECTION: 'σ',
    UNION: '∪',
    JOIN: '⋈',
    LPAREN: '(',
    RPAREN: ')',
    LBRACKET: '[',
    RBRACKET: ']',
    LBRACE: '{',
    RBRACE: '}',
    UNDERSCORE: '_',
    COMMA: ',',
    RELATION: 'RELATION',
    CONDITION: 'CONDITION'
};

// Tokenizer
function tokenize(query) {
    const tokens = [];
    let i = 0;

    while (i < query.length) {
        const char = query[i];

        // Skip whitespace
        if (/\s/.test(char)) {
            i++;
            continue;
        }

        // Special symbols
        if (char === 'π' || char === '\u03C0') {
            tokens.push({ type: TOKEN_TYPES.PROJECTION, value: 'π', pos: i });
            i++;
        } else if (char === 'σ' || char === '\u03C3') {
            tokens.push({ type: TOKEN_TYPES.SELECTION, value: 'σ', pos: i });
            i++;
        } else if (char === '∪' || char === '\u222A') {
            tokens.push({ type: TOKEN_TYPES.UNION, value: '∪', pos: i });
            i++;
        } else if (char === '⋈' || char === '\u22C8') {
            tokens.push({ type: TOKEN_TYPES.JOIN, value: '⋈', pos: i });
            i++;
        } else if (char === '(') {
            tokens.push({ type: TOKEN_TYPES.LPAREN, value: '(', pos: i });
            i++;
        } else if (char === ')') {
            tokens.push({ type: TOKEN_TYPES.RPAREN, value: ')', pos: i });
            i++;
        } else if (char === '[') {
            tokens.push({ type: TOKEN_TYPES.LBRACKET, value: '[', pos: i });
            i++;
        } else if (char === ']') {
            tokens.push({ type: TOKEN_TYPES.RBRACKET, value: ']', pos: i });
            i++;
        } else if (char === '{') {
            tokens.push({ type: TOKEN_TYPES.LBRACE, value: '{', pos: i });
            i++;
        } else if (char === '}') {
            tokens.push({ type: TOKEN_TYPES.RBRACE, value: '}', pos: i });
            i++;
        } else if (char === '_') {
            tokens.push({ type: TOKEN_TYPES.UNDERSCORE, value: '_', pos: i });
            i++;
        } else if (char === ',') {
            tokens.push({ type: TOKEN_TYPES.COMMA, value: ',', pos: i });
            i++;
        } else if (/[a-zA-Z]/.test(char)) {
            // Relation name or condition
            let value = '';
            const startPos = i;
            while (i < query.length && /[a-zA-Z0-9_><=!.]/.test(query[i])) {
                value += query[i];
                i++;
            }
            tokens.push({ type: TOKEN_TYPES.RELATION, value, pos: startPos });
        } else {
            i++;
        }
    }

    return tokens;
}

// Parser - builds an AST
class Parser {
    constructor(tokens) {
        this.tokens = tokens;
        this.current = 0;
    }

    parse() {
        return this.parseExpression();
    }

    parseExpression() {
        let left = this.parsePrimary();

        // Check for binary operators (join and union)
        while (this.peek()) {
            const token = this.peek();

            // Check for join
            if (token.type === TOKEN_TYPES.JOIN) {
                const joinToken = this.consume();
                this.expect(TOKEN_TYPES.UNDERSCORE);
                this.expect(TOKEN_TYPES.LBRACE);

                // Parse join condition (e.g., id=student_id)
                let condition = '';
                while (this.peek() && this.peek().type !== TOKEN_TYPES.RBRACE) {
                    condition += this.consume().value;
                }
                this.expect(TOKEN_TYPES.RBRACE);

                const right = this.parsePrimary();

                left = {
                    type: 'JOIN',
                    condition: condition,
                    left: left,
                    right: right,
                    startPos: left.startPos,
                    endPos: right.endPos
                };
            }
            // Check for union
            else if (token.type === TOKEN_TYPES.UNION) {
                const op = this.consume();
                const right = this.parseExpression();
                return {
                    type: 'UNION',
                    operator: op.value,
                    left: left,
                    right: right,
                    startPos: left.startPos,
                    endPos: right.endPos
                };
            } else {
                break;
            }
        }

        return left;
    }

    parsePrimary() {
        const token = this.peek();

        if (!token) {
            throw new Error('Unexpected end of query');
        }

        // Projection
        if (token.type === TOKEN_TYPES.PROJECTION) {
            return this.parseProjection();
        }

        // Selection
        if (token.type === TOKEN_TYPES.SELECTION) {
            return this.parseSelection();
        }

        // Parenthesized expression
        if (token.type === TOKEN_TYPES.LPAREN) {
            this.consume(); // (
            const expr = this.parseExpression();
            this.expect(TOKEN_TYPES.RPAREN);
            return expr;
        }

        // Relation name
        if (token.type === TOKEN_TYPES.RELATION) {
            const rel = this.consume();
            return {
                type: 'RELATION',
                name: rel.value,
                startPos: rel.pos,
                endPos: rel.pos + rel.value.length
            };
        }

        throw new Error(`Unexpected token: ${token.value}`);
    }

    parseProjection() {
        const startToken = this.consume(); // π
        this.expect(TOKEN_TYPES.LBRACKET);

        const attributes = [];
        while (this.peek() && this.peek().type !== TOKEN_TYPES.RBRACKET) {
            const attr = this.expect(TOKEN_TYPES.RELATION);
            attributes.push(attr.value);
            if (this.peek() && this.peek().type === TOKEN_TYPES.COMMA) {
                this.consume();
            }
        }

        this.expect(TOKEN_TYPES.RBRACKET);
        this.expect(TOKEN_TYPES.LPAREN);
        const relation = this.parseExpression();
        const endToken = this.expect(TOKEN_TYPES.RPAREN);

        return {
            type: 'PROJECTION',
            attributes: attributes,
            relation: relation,
            startPos: startToken.pos,
            endPos: endToken.pos + 1
        };
    }

    parseSelection() {
        const startToken = this.consume(); // σ
        this.expect(TOKEN_TYPES.LBRACKET);

        // Parse condition (simplified - just get everything inside brackets)
        let condition = '';
        while (this.peek() && this.peek().type !== TOKEN_TYPES.RBRACKET) {
            condition += this.consume().value;
        }

        this.expect(TOKEN_TYPES.RBRACKET);
        this.expect(TOKEN_TYPES.LPAREN);
        const relation = this.parseExpression();
        const endToken = this.expect(TOKEN_TYPES.RPAREN);

        return {
            type: 'SELECTION',
            condition: condition,
            relation: relation,
            startPos: startToken.pos,
            endPos: endToken.pos + 1
        };
    }

    peek() {
        return this.tokens[this.current];
    }

    consume() {
        return this.tokens[this.current++];
    }

    expect(type) {
        const token = this.peek();
        if (!token || token.type !== type) {
            throw new Error(`Expected ${type}, got ${token ? token.type : 'EOF'}`);
        }
        return this.consume();
    }
}

// Query executor - converts AST to execution steps
function createExecutionSteps(ast, originalQuery) {
    const steps = [];

    function traverse(node, depth = 0) {
        if (node.type === 'RELATION') {
            steps.push({
                type: 'RELATION',
                description: `Access base relation: ${node.name}`,
                node: node,
                data: DATABASES[node.name] || [],
                depth: depth,
                query: originalQuery,
                highlightStart: node.startPos,
                highlightEnd: node.endPos
            });
        } else if (node.type === 'PROJECTION') {
            // First process the relation
            traverse(node.relation, depth + 1);

            // Then apply projection
            const inputData = steps[steps.length - 1].data;
            const outputData = inputData.map(row => {
                const newRow = {};
                node.attributes.forEach(attr => {
                    if (row.hasOwnProperty(attr)) {
                        newRow[attr] = row[attr];
                    }
                });
                return newRow;
            });

            steps.push({
                type: 'PROJECTION',
                description: `Project attributes: [${node.attributes.join(', ')}]`,
                node: node,
                data: outputData,
                attributes: node.attributes,
                depth: depth,
                query: originalQuery,
                highlightStart: node.startPos,
                highlightEnd: node.endPos
            });
        } else if (node.type === 'SELECTION') {
            // First process the relation
            traverse(node.relation, depth + 1);

            // Then apply selection
            const inputData = steps[steps.length - 1].data;
            const outputData = inputData.filter(row => {
                return evaluateCondition(row, node.condition);
            });

            steps.push({
                type: 'SELECTION',
                description: `Filter rows where: ${node.condition}`,
                node: node,
                data: outputData,
                condition: node.condition,
                depth: depth,
                query: originalQuery,
                highlightStart: node.startPos,
                highlightEnd: node.endPos
            });
        } else if (node.type === 'UNION') {
            // Process left relation
            traverse(node.left, depth + 1);
            const leftData = steps[steps.length - 1].data;

            // Process right relation
            traverse(node.right, depth + 1);
            const rightData = steps[steps.length - 1].data;

            // Apply union (remove duplicates based on all attributes)
            const combined = [...leftData, ...rightData];
            const unique = [];
            const seen = new Set();

            combined.forEach(row => {
                const key = JSON.stringify(row);
                if (!seen.has(key)) {
                    seen.add(key);
                    unique.push(row);
                }
            });

            steps.push({
                type: 'UNION',
                description: `Union of two relations`,
                node: node,
                data: unique,
                depth: depth,
                query: originalQuery,
                highlightStart: node.startPos,
                highlightEnd: node.endPos
            });
        } else if (node.type === 'JOIN') {
            // Process left relation
            traverse(node.left, depth + 1);
            const leftData = steps[steps.length - 1].data;

            // Process right relation
            traverse(node.right, depth + 1);
            const rightData = steps[steps.length - 1].data;

            // Parse join condition (e.g., "id=student_id")
            const parts = node.condition.split('=');
            if (parts.length !== 2) {
                throw new Error(`Invalid join condition: ${node.condition}`);
            }
            const leftAttr = parts[0].trim();
            const rightAttr = parts[1].trim();

            // Apply theta join
            const joinedData = [];
            leftData.forEach(leftRow => {
                rightData.forEach(rightRow => {
                    if (leftRow[leftAttr] === rightRow[rightAttr]) {
                        // Merge rows
                        const mergedRow = { ...leftRow, ...rightRow };
                        joinedData.push(mergedRow);
                    }
                });
            });

            steps.push({
                type: 'JOIN',
                description: `Join on: ${node.condition}`,
                node: node,
                data: joinedData,
                condition: node.condition,
                depth: depth,
                query: originalQuery,
                highlightStart: node.startPos,
                highlightEnd: node.endPos
            });
        }
    }

    traverse(ast);
    return steps;
}

// Evaluate a condition on a row
function evaluateCondition(row, condition) {
    // Simple condition evaluator
    // Supports: attribute>value, attribute<value, attribute=value, attribute>=value, attribute<=value

    const operators = ['>=', '<=', '>', '<', '=', '!='];

    for (let op of operators) {
        if (condition.includes(op)) {
            const parts = condition.split(op);
            if (parts.length === 2) {
                const attr = parts[0].trim();
                let value = parts[1].trim();

                // Check if value is a number
                if (!isNaN(value)) {
                    value = parseFloat(value);
                } else {
                    // Remove quotes if present
                    value = value.replace(/['"]/g, '');
                }

                const rowValue = row[attr];

                switch (op) {
                    case '>': return rowValue > value;
                    case '<': return rowValue < value;
                    case '>=': return rowValue >= value;
                    case '<=': return rowValue <= value;
                    case '=': return rowValue == value;
                    case '!=': return rowValue != value;
                }
            }
        }
    }

    return true;
}

// Generate Mermaid diagram for current step (operation view)
function generateMermaidDiagram(step, stepIndex, totalSteps) {
    let diagram = 'graph TD\n';

    const stepId = `step${stepIndex}`;

    if (step.type === 'RELATION') {
        diagram += `    ${stepId}["${step.description}\\n${step.data.length} rows"]\n`;
        diagram += `    style ${stepId} fill:#90EE90\n`;
    } else if (step.type === 'PROJECTION') {
        const prevId = `step${stepIndex - 1}`;
        diagram += `    ${prevId}["Previous: ${currentSteps[stepIndex - 1].description}\\n${currentSteps[stepIndex - 1].data.length} rows"]\n`;
        diagram += `    ${stepId}["${step.description}\\n${step.data.length} rows"]\n`;
        diagram += `    ${prevId} --> ${stepId}\n`;
        diagram += `    style ${stepId} fill:#87CEEB\n`;
    } else if (step.type === 'SELECTION') {
        const prevId = `step${stepIndex - 1}`;
        diagram += `    ${prevId}["Previous: ${currentSteps[stepIndex - 1].description}\\n${currentSteps[stepIndex - 1].data.length} rows"]\n`;
        diagram += `    ${stepId}["${step.description}\\n${step.data.length} rows"]\n`;
        diagram += `    ${prevId} --> ${stepId}\n`;
        diagram += `    style ${stepId} fill:#FFB6C1\n`;
    } else if (step.type === 'UNION') {
        const leftIdx = stepIndex - 2;
        const rightIdx = stepIndex - 1;
        const leftId = `step${leftIdx}`;
        const rightId = `step${rightIdx}`;

        diagram += `    ${leftId}["Left: ${currentSteps[leftIdx].description}\\n${currentSteps[leftIdx].data.length} rows"]\n`;
        diagram += `    ${rightId}["Right: ${currentSteps[rightIdx].description}\\n${currentSteps[rightIdx].data.length} rows"]\n`;
        diagram += `    ${stepId}["${step.description}\\n${step.data.length} rows"]\n`;
        diagram += `    ${leftId} --> ${stepId}\n`;
        diagram += `    ${rightId} --> ${stepId}\n`;
        diagram += `    style ${stepId} fill:#DDA0DD\n`;
    } else if (step.type === 'JOIN') {
        const leftIdx = stepIndex - 2;
        const rightIdx = stepIndex - 1;
        const leftId = `step${leftIdx}`;
        const rightId = `step${rightIdx}`;

        diagram += `    ${leftId}["Left: ${currentSteps[leftIdx].description}\\n${currentSteps[leftIdx].data.length} rows"]\n`;
        diagram += `    ${rightId}["Right: ${currentSteps[rightIdx].description}\\n${currentSteps[rightIdx].data.length} rows"]\n`;
        diagram += `    ${stepId}["${step.description}\\n${step.data.length} rows"]\n`;
        diagram += `    ${leftId} --> ${stepId}\n`;
        diagram += `    ${rightId} --> ${stepId}\n`;
        diagram += `    style ${stepId} fill:#FFD700\n`;
    }

    return diagram;
}

// Generate full execution graph showing all steps
function generateFullExecutionGraph(currentStepIndex) {
    let diagram = 'graph TD\n';

    // Create nodes for all steps
    currentSteps.forEach((step, idx) => {
        const stepId = `step${idx}`;
        const isCurrentStep = idx === currentStepIndex;
        const prefix = isCurrentStep ? '▶ ' : '';

        diagram += `    ${stepId}["${prefix}Step ${idx + 1}: ${step.description}\\n${step.data.length} rows"]\n`;

        // Color based on operation type
        let color = '#E0E0E0'; // default gray
        if (step.type === 'RELATION') color = '#90EE90'; // green
        else if (step.type === 'PROJECTION') color = '#87CEEB'; // sky blue
        else if (step.type === 'SELECTION') color = '#FFB6C1'; // pink
        else if (step.type === 'UNION') color = '#DDA0DD'; // plum
        else if (step.type === 'JOIN') color = '#FFD700'; // gold

        diagram += `    style ${stepId} fill:${color}`;

        // Highlight current step with bold border
        if (isCurrentStep) {
            diagram += ',stroke:#FF0000,stroke-width:4px';
        }
        diagram += '\n';
    });

    // Create edges based on operation dependencies
    currentSteps.forEach((step, idx) => {
        if (step.type === 'PROJECTION' || step.type === 'SELECTION') {
            // Unary operations - connect to previous step
            if (idx > 0) {
                diagram += `    step${idx - 1} --> step${idx}\n`;
            }
        } else if (step.type === 'UNION' || step.type === 'JOIN') {
            // Binary operations - connect to two previous steps
            if (idx >= 2) {
                diagram += `    step${idx - 2} --> step${idx}\n`;
                diagram += `    step${idx - 1} --> step${idx}\n`;
            }
        }
    });

    return diagram;
}

// Toggle between graph modes
function toggleGraphMode() {
    const toggle = document.getElementById('graphModeToggle');
    currentGraphMode = toggle.checked ? 'execution' : 'operation';

    // Redisplay current step with new graph mode
    displayStep(currentStepIndex);
}

// Display functions
function displayStep(stepIndex) {
    if (stepIndex < 0 || stepIndex >= currentSteps.length) {
        return;
    }

    const step = currentSteps[stepIndex];

    // Display query with highlighted portion
    const queryDisplay = document.getElementById('queryDisplay');
    const beforeHighlight = step.query.substring(0, step.highlightStart);
    const highlighted = step.query.substring(step.highlightStart, step.highlightEnd);
    const afterHighlight = step.query.substring(step.highlightEnd);

    queryDisplay.innerHTML = `${escapeHtml(beforeHighlight)}<span class="highlight">${escapeHtml(highlighted)}</span>${escapeHtml(afterHighlight)}`;

    // Display step info
    const stepInfo = document.getElementById('stepInfo');
    stepInfo.innerHTML = `<strong>Step ${stepIndex + 1} of ${currentSteps.length}:</strong> ${step.description}`;

    // Display data as table
    const dataDisplay = document.getElementById('dataDisplay');
    if (step.data.length > 0) {
        const headers = Object.keys(step.data[0]);
        let table = '<table><thead><tr>';
        headers.forEach(h => {
            table += `<th>${h}</th>`;
        });
        table += '</tr></thead><tbody>';

        step.data.forEach(row => {
            table += '<tr>';
            headers.forEach(h => {
                table += `<td>${row[h]}</td>`;
            });
            table += '</tr>';
        });

        table += '</tbody></table>';
        dataDisplay.innerHTML = table;
    } else {
        dataDisplay.innerHTML = '<p>No data (empty result set)</p>';
    }

    // Generate and display Mermaid diagram based on current mode
    let diagram;
    if (currentGraphMode === 'operation') {
        diagram = generateMermaidDiagram(step, stepIndex, currentSteps.length);
    } else {
        diagram = generateFullExecutionGraph(stepIndex);
    }

    const mermaidContainer = document.getElementById('mermaidDiagram');
    mermaidContainer.innerHTML = '';

    const diagramDiv = document.createElement('div');
    diagramDiv.className = 'mermaid';
    diagramDiv.textContent = diagram;
    mermaidContainer.appendChild(diagramDiv);

    mermaid.run({ nodes: [diagramDiv] });

    // Update button states
    document.getElementById('prevBtn').disabled = stepIndex === 0;
    document.getElementById('nextBtn').disabled = stepIndex === currentSteps.length - 1;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Navigation functions
function nextStep() {
    if (currentStepIndex < currentSteps.length - 1) {
        currentStepIndex++;
        displayStep(currentStepIndex);
    }
}

function previousStep() {
    if (currentStepIndex > 0) {
        currentStepIndex--;
        displayStep(currentStepIndex);
    }
}

// Main execution function
function parseAndExecute() {
    const queryInput = document.getElementById('queryInput').value;
    const errorDisplay = document.getElementById('errorDisplay');
    const executionSection = document.getElementById('executionSection');

    errorDisplay.textContent = '';

    try {
        // Tokenize
        const tokens = tokenize(queryInput);

        // Parse
        const parser = new Parser(tokens);
        parsedQuery = parser.parse();

        // Create execution steps
        currentSteps = createExecutionSteps(parsedQuery, queryInput);
        currentStepIndex = 0;

        // Show execution section
        executionSection.style.display = 'block';

        // Display first step
        displayStep(0);

    } catch (error) {
        errorDisplay.textContent = `Error: ${error.message}`;
        executionSection.style.display = 'none';
    }
}

function resetQuery() {
    currentSteps = [];
    currentStepIndex = -1;
    parsedQuery = null;
    document.getElementById('executionSection').style.display = 'none';
    document.getElementById('errorDisplay').textContent = '';
}

function loadExample(index) {
    const examples = currentDatabase?.examples || [];
    if (index >= 0 && index < examples.length) {
        document.getElementById('queryInput').value = examples[index];
    }
}

function insertSymbol(symbol) {
    const textarea = document.getElementById('queryInput');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Insert symbol at cursor position
    const before = text.substring(0, start);
    const after = text.substring(end);
    textarea.value = before + symbol + after;

    // Set cursor position after inserted symbol
    const newCursorPos = start + symbol.length;
    textarea.selectionStart = newCursorPos;
    textarea.selectionEnd = newCursorPos;
    textarea.focus();
}
