import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface CSVData {
  headers: string[];
  rows: string[][];
  filename: string;
  loadedAt: Date;
}

interface CSVState {
  currentData: CSVData | null;
  analyses: Array<{
    type: string;
    result: string;
    timestamp: Date;
  }>;
}

const state: CSVState = {
  currentData: null,
  analyses: []
};

function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const rows = lines.slice(1).map(line => 
    line.split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''))
  );
  return { headers, rows };
}

function calculateStats(values: number[]): { min: number; max: number; avg: number; sum: number; count: number } {
  const validValues = values.filter(v => !isNaN(v));
  if (validValues.length === 0) return { min: 0, max: 0, avg: 0, sum: 0, count: 0 };
  
  return {
    min: Math.min(...validValues),
    max: Math.max(...validValues),
    avg: validValues.reduce((a, b) => a + b, 0) / validValues.length,
    sum: validValues.reduce((a, b) => a + b, 0),
    count: validValues.length
  };
}

export const csvAnalyzer: BuiltInSkill = {
  id: 'csv-analyzer',
  name: 'CSV Analyzer',
  description: 'Analyze CSV data with powerful statistics and insights. Get summaries, detect patterns, and export findings.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📊',
  category: 'data',
  installCount: 3456,
  rating: 4.6,
  commands: [
    {
      name: 'analyze',
      description: 'Analyze CSV data',
      usage: 'csv analyze <csv-content>',
      examples: ['csv analyze "name,age,score\\nJohn,25,85\\nJane,30,92"']
    },
    {
      name: 'stats',
      description: 'Get statistics for a column',
      usage: 'csv stats <column-name>',
      examples: ['csv stats age', 'csv stats score']
    },
    {
      name: 'insights',
      description: 'Get AI-powered insights',
      usage: 'csv insights',
      examples: ['csv insights']
    },
    {
      name: 'export',
      description: 'Export analysis results',
      usage: 'csv export [format]',
      examples: ['csv export', 'csv export markdown']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'analyze': {
        const content = Object.values(params).join(' ').replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');

        if (!content || !content.includes(',')) {
          return {
            success: false,
            message: 'Please provide CSV content. Usage: csv analyze <csv-content>\n\n' +
              'Example: csv analyze "name,age,score\\nJohn,25,85\\nJane,30,92"'
          };
        }

        const parsed = parseCSV(content);
        state.currentData = {
          headers: parsed.headers,
          rows: parsed.rows,
          filename: 'inline-data',
          loadedAt: new Date()
        };

        let analysisText = '📊 CSV ANALYSIS\n\n';
        analysisText += 'STRUCTURE:\n';
        analysisText += '  Columns: ' + parsed.headers.length + '\n';
        analysisText += '  Rows: ' + parsed.rows.length + '\n\n';
        analysisText += 'COLUMNS:\n';
        
        parsed.headers.forEach((header, i) => {
          const columnValues = parsed.rows.map(r => r[i]);
          const numericValues = columnValues.map(v => parseFloat(v)).filter(v => !isNaN(v));
          const isNumeric = numericValues.length > columnValues.length * 0.5;
          
          analysisText += '  ' + (i + 1) + '. ' + header + ' (' + (isNumeric ? 'numeric' : 'text') + ')\n';
        });

        analysisText += '\nDATA PREVIEW (first 3 rows):\n';
        analysisText += '━━━━━━━━━━━━━━━━━━━━\n';
        analysisText += parsed.headers.map(h => h.substring(0, 10).padEnd(12)).join('') + '\n';
        analysisText += '━━━━━━━━━━━━━━━━━━━━\n';
        parsed.rows.slice(0, 3).forEach(row => {
          analysisText += row.map(c => c.substring(0, 10).padEnd(12)).join('') + '\n';
        });

        analysisText += '\nUse "csv stats <column>" for detailed statistics.\n';
        analysisText += 'Use "csv insights" for AI-powered analysis.';

        return {
          success: true,
          message: analysisText
        };
      }

      case 'stats': {
        if (!state.currentData) {
          return {
            success: false,
            message: 'No CSV data loaded. Use "csv analyze <content>" first.'
          };
        }

        const columnName = Object.values(params).join(' ').toLowerCase();
        const columnIndex = state.currentData.headers.findIndex(
          h => h.toLowerCase() === columnName || h.toLowerCase().includes(columnName)
        );

        if (columnIndex === -1) {
          return {
            success: false,
            message: 'Column "' + columnName + '" not found.\n\n' +
              'Available columns: ' + state.currentData.headers.join(', ')
          };
        }

        const header = state.currentData.headers[columnIndex];
        const values = state.currentData.rows.map(r => r[columnIndex]);
        const numericValues = values.map(v => parseFloat(v));
        const stats = calculateStats(numericValues);

        const uniqueValues = [...new Set(values)];
        const isNumeric = stats.count > values.length * 0.5;

        let statsText = '📈 COLUMN STATISTICS: ' + header.toUpperCase() + '\n\n';

        if (isNumeric) {
          statsText += 'TYPE: Numeric\n\n';
          statsText += 'STATISTICS:\n';
          statsText += '  Count: ' + stats.count + '\n';
          statsText += '  Sum: ' + stats.sum.toFixed(2) + '\n';
          statsText += '  Average: ' + stats.avg.toFixed(2) + '\n';
          statsText += '  Minimum: ' + stats.min + '\n';
          statsText += '  Maximum: ' + stats.max + '\n';
          statsText += '  Range: ' + (stats.max - stats.min) + '\n';
        } else {
          statsText += 'TYPE: Categorical/Text\n\n';
          statsText += 'STATISTICS:\n';
          statsText += '  Total values: ' + values.length + '\n';
          statsText += '  Unique values: ' + uniqueValues.length + '\n';
          statsText += '  Most common: ' + uniqueValues[0] + '\n\n';
          statsText += 'TOP VALUES:\n';
          uniqueValues.slice(0, 5).forEach((v, i) => {
            const count = values.filter(val => val === v).length;
            statsText += '  ' + (i + 1) + '. ' + v + ' (' + count + ' occurrences)\n';
          });
        }

        state.analyses.push({
          type: 'stats',
          result: header + ' statistics',
          timestamp: new Date()
        });

        return {
          success: true,
          message: statsText
        };
      }

      case 'insights': {
        if (!state.currentData) {
          return {
            success: false,
            message: 'No CSV data loaded. Use "csv analyze <content>" first.'
          };
        }

        const headers = state.currentData.headers;
        const rows = state.currentData.rows;

        let insightsText = '💡 DATA INSIGHTS\n\n';
        insightsText += 'Dataset: ' + rows.length + ' rows x ' + headers.length + ' columns\n\n';
        insightsText += 'KEY OBSERVATIONS:\n';
        insightsText += '━━━━━━━━━━━━━━━━━━━━\n\n';

        insightsText += '1. DATA COMPLETENESS\n';
        const emptyCells = rows.reduce((count, row) => 
          count + row.filter(cell => !cell || cell.trim() === '').length, 0
        );
        const totalCells = rows.length * headers.length;
        const completeness = ((totalCells - emptyCells) / totalCells * 100).toFixed(1);
        insightsText += '   ' + completeness + '% of cells contain data\n\n';

        insightsText += '2. NUMERIC COLUMNS\n';
        headers.forEach((header, i) => {
          const numericCount = rows.map(r => parseFloat(r[i])).filter(v => !isNaN(v)).length;
          if (numericCount > rows.length * 0.5) {
            const stats = calculateStats(rows.map(r => parseFloat(r[i])));
            insightsText += '   ' + header + ': avg=' + stats.avg.toFixed(2) + ', range=' + stats.min + '-' + stats.max + '\n';
          }
        });

        insightsText += '\n3. RECOMMENDATIONS\n';
        insightsText += '   • Review columns with missing data\n';
        insightsText += '   • Consider normalizing numeric ranges\n';
        insightsText += '   • Check for duplicate rows\n';

        state.analyses.push({
          type: 'insights',
          result: 'Full insights generated',
          timestamp: new Date()
        });

        return {
          success: true,
          message: insightsText
        };
      }

      case 'export': {
        if (!state.currentData) {
          return {
            success: false,
            message: 'No CSV data loaded. Use "csv analyze <content>" first.'
          };
        }

        const format = (params.arg0 as string)?.toLowerCase() || 'text';

        let exportText = '';

        if (format === 'markdown') {
          exportText = '# CSV Analysis Report\n\n';
          exportText += '## Summary\n';
          exportText += '- **Columns**: ' + state.currentData.headers.length + '\n';
          exportText += '- **Rows**: ' + state.currentData.rows.length + '\n';
          exportText += '- **Analyzed**: ' + state.currentData.loadedAt.toLocaleString() + '\n\n';
          exportText += '## Columns\n';
          exportText += '| # | Name | Type |\n';
          exportText += '|---|------|------|\n';
          state.currentData.headers.forEach((h, i) => {
            const isNumeric = state.currentData!.rows.map(r => parseFloat(r[i])).filter(v => !isNaN(v)).length > state.currentData!.rows.length * 0.5;
            exportText += '| ' + (i + 1) + ' | ' + h + ' | ' + (isNumeric ? 'Numeric' : 'Text') + ' |\n';
          });
        } else {
          exportText = '========== CSV ANALYSIS REPORT ==========\n\n';
          exportText += 'Summary:\n';
          exportText += '  Columns: ' + state.currentData.headers.length + '\n';
          exportText += '  Rows: ' + state.currentData.rows.length + '\n';
          exportText += '  Analyzed: ' + state.currentData.loadedAt.toLocaleString() + '\n\n';
          exportText += 'Columns: ' + state.currentData.headers.join(', ') + '\n';
          exportText += '\n=========================================';
        }

        return {
          success: true,
          message: '📤 EXPORT (' + format.toUpperCase() + ')\n\n' + exportText
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: analyze, stats, insights, export'
        };
    }
  }
};

export default csvAnalyzer;
