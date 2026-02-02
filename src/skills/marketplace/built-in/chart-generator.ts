import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface ChartState {
  lastChart: string | null;
  history: Array<{
    type: string;
    data: string;
    timestamp: Date;
  }>;
}

const state: ChartState = {
  lastChart: null,
  history: []
};

function parseData(input: string): Array<{ label: string; value: number }> {
  const pairs = input.split(/[,;]/).map(p => p.trim());
  return pairs.map(pair => {
    const match = pair.match(/([^:=]+)[:\s=]+(\d+(?:\.\d+)?)/);
    if (match) {
      return { label: match[1].trim(), value: parseFloat(match[2]) };
    }
    const parts = pair.split(/\s+/);
    if (parts.length >= 2) {
      const num = parseFloat(parts[parts.length - 1]);
      if (!isNaN(num)) {
        return { label: parts.slice(0, -1).join(' '), value: num };
      }
    }
    return null;
  }).filter((item): item is { label: string; value: number } => item !== null);
}

function generateBar(value: number, max: number, width: number = 30): string {
  const normalized = Math.round((value / max) * width);
  return '█'.repeat(normalized) + '░'.repeat(width - normalized);
}

export const chartGenerator: BuiltInSkill = {
  id: 'chart-generator',
  name: 'Chart Generator',
  description: 'Create beautiful ASCII charts and tables. Visualize data instantly without leaving your terminal.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📈',
  category: 'data',
  installCount: 2789,
  rating: 4.5,
  commands: [
    {
      name: 'bar',
      description: 'Create a horizontal bar chart',
      usage: 'chart bar <data>',
      examples: ['chart bar "Sales:100, Marketing:80, Engineering:120"']
    },
    {
      name: 'line',
      description: 'Create an ASCII line chart',
      usage: 'chart line <data>',
      examples: ['chart line "Jan:10, Feb:25, Mar:18, Apr:30"']
    },
    {
      name: 'pie',
      description: 'Create a text-based pie chart representation',
      usage: 'chart pie <data>',
      examples: ['chart pie "Desktop:60, Mobile:30, Tablet:10"']
    },
    {
      name: 'table',
      description: 'Create a formatted data table',
      usage: 'chart table <data>',
      examples: ['chart table "Name:John, Age:25; Name:Jane, Age:30"']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'bar': {
        const input = Object.values(params).join(' ').replace(/^["']|["']$/g, '');
        
        if (!input) {
          return {
            success: false,
            message: 'Please provide data. Usage: chart bar <data>\n\n' +
              'Example: chart bar "Sales:100, Marketing:80, Engineering:120"'
          };
        }

        const data = parseData(input);
        
        if (data.length === 0) {
          return {
            success: false,
            message: 'Could not parse data. Use format: "Label:Value, Label:Value"'
          };
        }

        const maxValue = Math.max(...data.map(d => d.value));
        const maxLabelLength = Math.max(...data.map(d => d.label.length));

        let chartText = '📊 BAR CHART\n\n';
        
        data.forEach(item => {
          const label = item.label.padEnd(maxLabelLength);
          const bar = generateBar(item.value, maxValue, 25);
          chartText += label + ' │' + bar + '│ ' + item.value + '\n';
        });

        chartText += '\nMax value: ' + maxValue;

        state.lastChart = chartText;
        state.history.push({ type: 'bar', data: input, timestamp: new Date() });

        return {
          success: true,
          message: chartText
        };
      }

      case 'line': {
        const input = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!input) {
          return {
            success: false,
            message: 'Please provide data. Usage: chart line <data>\n\n' +
              'Example: chart line "Jan:10, Feb:25, Mar:18, Apr:30"'
          };
        }

        const data = parseData(input);

        if (data.length < 2) {
          return {
            success: false,
            message: 'Line charts need at least 2 data points.'
          };
        }

        const maxValue = Math.max(...data.map(d => d.value));
        const minValue = Math.min(...data.map(d => d.value));
        const height = 8;

        let chartText = '📈 LINE CHART\n\n';
        
        const grid: string[][] = [];
        for (let i = 0; i < height; i++) {
          grid.push(new Array(data.length).fill(' '));
        }

        data.forEach((item, x) => {
          const normalizedY = Math.round(((item.value - minValue) / (maxValue - minValue || 1)) * (height - 1));
          const y = height - 1 - normalizedY;
          grid[y][x] = '●';
          
          for (let i = y + 1; i < height; i++) {
            if (grid[i][x] === ' ') grid[i][x] = '│';
          }
        });

        chartText += maxValue.toString().padStart(6) + ' ┤';
        for (let y = 0; y < height; y++) {
          if (y === 0) {
            chartText += grid[y].join('─') + '\n';
          } else if (y === height - 1) {
            chartText += minValue.toString().padStart(6) + ' ┤' + grid[y].join('─') + '\n';
          } else {
            chartText += '       │' + grid[y].join(' ') + '\n';
          }
        }
        
        chartText += '       └' + '─'.repeat(data.length * 2 - 1) + '\n';
        chartText += '        ' + data.map(d => d.label.substring(0, 1)).join(' ') + '\n\n';
        chartText += 'Labels: ' + data.map(d => d.label).join(', ');

        state.lastChart = chartText;
        state.history.push({ type: 'line', data: input, timestamp: new Date() });

        return {
          success: true,
          message: chartText
        };
      }

      case 'pie': {
        const input = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!input) {
          return {
            success: false,
            message: 'Please provide data. Usage: chart pie <data>\n\n' +
              'Example: chart pie "Desktop:60, Mobile:30, Tablet:10"'
          };
        }

        const data = parseData(input);
        const total = data.reduce((sum, d) => sum + d.value, 0);

        let chartText = '🥧 PIE CHART\n\n';
        chartText += '    ╭──────────╮\n';
        chartText += '   ╱            ╲\n';
        chartText += '  │   TOTAL:    │\n';
        chartText += '  │    ' + total.toString().padStart(4) + '      │\n';
        chartText += '   ╲            ╱\n';
        chartText += '    ╰──────────╯\n\n';

        const symbols = ['█', '▓', '▒', '░', '▪', '▫', '●', '○'];
        
        chartText += 'BREAKDOWN:\n';
        chartText += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
        
        data.forEach((item, i) => {
          const percentage = ((item.value / total) * 100).toFixed(1);
          const barLength = Math.round((item.value / total) * 20);
          const symbol = symbols[i % symbols.length];
          
          chartText += symbol + ' ' + item.label.padEnd(12) + ' ';
          chartText += symbol.repeat(barLength).padEnd(20) + ' ';
          chartText += percentage + '% (' + item.value + ')\n';
        });

        state.lastChart = chartText;
        state.history.push({ type: 'pie', data: input, timestamp: new Date() });

        return {
          success: true,
          message: chartText
        };
      }

      case 'table': {
        const input = Object.values(params).join(' ').replace(/^["']|["']$/g, '');

        if (!input) {
          return {
            success: false,
            message: 'Please provide data. Usage: chart table <data>\n\n' +
              'Example: chart table "Name:John, Age:25; Name:Jane, Age:30"'
          };
        }

        const rows = input.split(';').map(row => {
          const cells: Record<string, string> = {};
          row.split(',').forEach(cell => {
            const match = cell.match(/([^:=]+)[:\s=]+(.+)/);
            if (match) {
              cells[match[1].trim()] = match[2].trim();
            }
          });
          return cells;
        }).filter(row => Object.keys(row).length > 0);

        if (rows.length === 0) {
          return {
            success: false,
            message: 'Could not parse table data. Use format: "Col1:Val1, Col2:Val2; Col1:Val3, Col2:Val4"'
          };
        }

        const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
        const colWidths = columns.map(col => 
          Math.max(col.length, ...rows.map(r => (r[col] || '').length))
        );

        let tableText = '📋 DATA TABLE\n\n';
        
        tableText += '┌' + colWidths.map(w => '─'.repeat(w + 2)).join('┬') + '┐\n';
        
        tableText += '│' + columns.map((col, i) => ' ' + col.padEnd(colWidths[i]) + ' ').join('│') + '│\n';
        
        tableText += '├' + colWidths.map(w => '─'.repeat(w + 2)).join('┼') + '┤\n';
        
        rows.forEach(row => {
          tableText += '│' + columns.map((col, i) => ' ' + (row[col] || '').padEnd(colWidths[i]) + ' ').join('│') + '│\n';
        });
        
        tableText += '└' + colWidths.map(w => '─'.repeat(w + 2)).join('┴') + '┘\n';
        
        tableText += '\n' + rows.length + ' row(s), ' + columns.length + ' column(s)';

        state.lastChart = tableText;
        state.history.push({ type: 'table', data: input, timestamp: new Date() });

        return {
          success: true,
          message: tableText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: bar, line, pie, table'
        };
    }
  }
};

export default chartGenerator;
