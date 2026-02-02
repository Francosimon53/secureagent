import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface Expense {
  id: string;
  amount: number;
  category: string;
  description: string;
  date: Date;
}

interface ExpenseState {
  expenses: Expense[];
  categories: string[];
  nextId: number;
}

const state: ExpenseState = {
  expenses: [],
  categories: ['food', 'transport', 'entertainment', 'utilities', 'shopping', 'health', 'other'],
  nextId: 1
};

function generateId(): string {
  return 'EXP-' + String(state.nextId++).padStart(4, '0');
}

export const expenseTracker: BuiltInSkill = {
  id: 'expense-tracker',
  name: 'Expense Tracker',
  description: 'Track your spending habits with ease. Categorize expenses, view reports, and gain insights into where your money goes.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '💰',
  category: 'productivity',
  installCount: 3289,
  rating: 4.6,
  commands: [
    {
      name: 'add',
      description: 'Add a new expense',
      usage: 'expense add <amount> <category> [description]',
      examples: [
        'expense add 25.50 food lunch',
        'expense add 50 transport uber ride'
      ]
    },
    {
      name: 'list',
      description: 'List recent expenses',
      usage: 'expense list [category] [days]',
      examples: ['expense list', 'expense list food', 'expense list all 30']
    },
    {
      name: 'report',
      description: 'Generate expense report',
      usage: 'expense report [week|month|year]',
      examples: ['expense report', 'expense report month']
    },
    {
      name: 'categories',
      description: 'View or manage categories',
      usage: 'expense categories [add <name>]',
      examples: ['expense categories', 'expense categories add subscriptions']
    },
    {
      name: 'total',
      description: 'Get total spending',
      usage: 'expense total [category] [period]',
      examples: ['expense total', 'expense total food week']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'add': {
        const amount = parseFloat((params.arg0 as string));
        if (isNaN(amount)) {
          return {
            success: false,
            message: 'Please provide a valid amount. Usage: expense add <amount> <category> [description]'
          };
        }

        const category = (params.arg1 as string)?.toLowerCase() || 'other';
        if (!state.categories.includes(category)) {
          return {
            success: false,
            message: 'Invalid category "' + category + '". Available categories: ' + state.categories.join(', ')
          };
        }

        const description = Object.values(params).slice(2).join(' ') || 'No description';

        const expense: Expense = {
          id: generateId(),
          amount,
          category,
          description,
          date: new Date()
        };
        state.expenses.push(expense);

        const monthTotal = state.expenses
          .filter(e => {
            const now = new Date();
            return e.date.getMonth() === now.getMonth() && 
                   e.date.getFullYear() === now.getFullYear();
          })
          .reduce((sum, e) => sum + e.amount, 0);

        return {
          success: true,
          message: '💰 EXPENSE ADDED\n\n' +
            'ID: ' + expense.id + '\n' +
            'Amount: $' + amount.toFixed(2) + '\n' +
            'Category: ' + category + '\n' +
            'Description: ' + description + '\n' +
            'Date: ' + expense.date.toLocaleDateString() + '\n\n' +
            'Monthly total: $' + monthTotal.toFixed(2)
        };
      }

      case 'list': {
        const categoryFilter = (params.arg0 as string)?.toLowerCase();
        const days = parseInt((params.arg1 as string)) || 7;
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

        let filtered = state.expenses.filter(e => e.date >= cutoff);
        
        if (categoryFilter && categoryFilter !== 'all' && state.categories.includes(categoryFilter)) {
          filtered = filtered.filter(e => e.category === categoryFilter);
        }

        filtered.sort((a, b) => b.date.getTime() - a.date.getTime());

        if (filtered.length === 0) {
          return {
            success: true,
            message: '💰 No expenses found' + (categoryFilter ? ' in ' + categoryFilter : '') + ' for the last ' + days + ' days.\n\n' +
              'Use "expense add" to track a new expense.'
          };
        }

        let listText = '💰 EXPENSES (Last ' + days + ' days' + (categoryFilter && categoryFilter !== 'all' ? ' - ' + categoryFilter : '') + ')\n\n';
        
        const total = filtered.reduce((sum, e) => sum + e.amount, 0);
        
        filtered.slice(0, 15).forEach(expense => {
          listText += expense.id + ' | $' + expense.amount.toFixed(2) + ' | ' + expense.category + '\n';
          listText += '  ' + expense.description + ' - ' + expense.date.toLocaleDateString() + '\n\n';
        });

        if (filtered.length > 15) {
          listText += '... and ' + (filtered.length - 15) + ' more expenses\n\n';
        }

        listText += '━━━━━━━━━━━━━━━━━━━━\n';
        listText += 'Total: $' + total.toFixed(2);

        return {
          success: true,
          message: listText
        };
      }

      case 'report': {
        const period = (params.arg0 as string) || 'month';
        const now = new Date();
        let cutoff: Date;
        
        if (period === 'week') {
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'year') {
          cutoff = new Date(now.getFullYear(), 0, 1);
        } else {
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        const filtered = state.expenses.filter(e => e.date >= cutoff);
        const total = filtered.reduce((sum, e) => sum + e.amount, 0);

        const byCategory: Record<string, number> = {};
        filtered.forEach(e => {
          byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
        });

        const sortedCategories = Object.entries(byCategory)
          .sort((a, b) => b[1] - a[1]);

        let reportText = '📊 EXPENSE REPORT (' + period.toUpperCase() + ')\n\n';
        reportText += 'Period: ' + cutoff.toLocaleDateString() + ' - ' + now.toLocaleDateString() + '\n';
        reportText += 'Total expenses: ' + filtered.length + '\n';
        reportText += 'Total spent: $' + total.toFixed(2) + '\n\n';
        reportText += 'BY CATEGORY:\n';
        reportText += '━━━━━━━━━━━━━━━━━━━━\n';

        sortedCategories.forEach(function(item) {
          const cat = item[0];
          const amount = item[1];
          const percentage = ((amount / total) * 100).toFixed(1);
          const bar = '█'.repeat(Math.round(parseFloat(percentage) / 5));
          reportText += cat.padEnd(12) + ' $' + amount.toFixed(2).padStart(8) + ' ' + bar + ' ' + percentage + '%\n';
        });

        const avgPerDay = total / Math.ceil((now.getTime() - cutoff.getTime()) / (24 * 60 * 60 * 1000));
        reportText += '\nDaily average: $' + avgPerDay.toFixed(2);

        return {
          success: true,
          message: reportText
        };
      }

      case 'categories': {
        if ((params.arg0 as string) === 'add' && (params.arg1 as string)) {
          const newCategory = (params.arg1 as string).toLowerCase();
          if (state.categories.includes(newCategory)) {
            return {
              success: false,
              message: 'Category "' + newCategory + '" already exists.'
            };
          }
          state.categories.push(newCategory);
          return {
            success: true,
            message: '✅ Category "' + newCategory + '" added!\n\nAll categories: ' + state.categories.join(', ')
          };
        }

        const categoryStats = state.categories.map(cat => {
          const count = state.expenses.filter(e => e.category === cat).length;
          const total = state.expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0);
          return { name: cat, count, total };
        });

        let catText = '📁 EXPENSE CATEGORIES\n\n';
        categoryStats.forEach(cat => {
          catText += cat.name.padEnd(15) + ' ' + cat.count + ' expenses | $' + cat.total.toFixed(2) + '\n';
        });
        catText += '\nUse "expense categories add <name>" to add a new category.';

        return {
          success: true,
          message: catText
        };
      }

      case 'total': {
        const categoryFilter = (params.arg0 as string)?.toLowerCase();
        const period = (params.arg1 as string) || 'month';
        const now = new Date();
        let cutoff: Date;

        if (period === 'week') {
          cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        } else if (period === 'year') {
          cutoff = new Date(now.getFullYear(), 0, 1);
        } else {
          cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
        }

        let filtered = state.expenses.filter(e => e.date >= cutoff);
        if (categoryFilter && state.categories.includes(categoryFilter)) {
          filtered = filtered.filter(e => e.category === categoryFilter);
        }

        const total = filtered.reduce((sum, e) => sum + e.amount, 0);
        const count = filtered.length;

        return {
          success: true,
          message: '💰 TOTAL SPENDING\n\n' +
            'Period: ' + period + '\n' +
            (categoryFilter ? 'Category: ' + categoryFilter + '\n' : '') +
            '\nExpenses: ' + count + '\n' +
            'Total: $' + total.toFixed(2) + '\n' +
            'Average: $' + (count > 0 ? (total / count).toFixed(2) : '0.00') + ' per expense'
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: add, list, report, categories, total'
        };
    }
  }
};

export default expenseTracker;
