import { BuiltInSkill, SkillExecuteResult } from '../types.js';

interface ReportSection {
  title: string;
  content: string;
}

interface ReportState {
  currentReport: {
    title: string;
    type: string;
    sections: ReportSection[];
    createdAt: Date;
  } | null;
  savedReports: Array<{
    title: string;
    type: string;
    content: string;
    savedAt: Date;
  }>;
}

const state: ReportState = {
  currentReport: null,
  savedReports: []
};

function generateExecutiveSummary(topic: string, keyPoints: string[]): string {
  let report = '═══════════════════════════════════════════════════\n';
  report += '              EXECUTIVE SUMMARY\n';
  report += '═══════════════════════════════════════════════════\n\n';
  report += 'RE: ' + topic + '\n';
  report += 'Date: ' + new Date().toLocaleDateString() + '\n';
  report += 'Classification: Internal\n\n';
  report += '───────────────────────────────────────────────────\n';
  report += 'OVERVIEW\n';
  report += '───────────────────────────────────────────────────\n\n';
  report += 'This report provides a high-level summary of ' + topic + '.\n';
  report += 'Key findings and recommendations are outlined below.\n\n';
  report += '───────────────────────────────────────────────────\n';
  report += 'KEY FINDINGS\n';
  report += '───────────────────────────────────────────────────\n\n';
  
  if (keyPoints.length > 0) {
    keyPoints.forEach((point, i) => {
      report += '  ' + (i + 1) + '. ' + point + '\n';
    });
  } else {
    report += '  1. [Add key finding]\n';
    report += '  2. [Add key finding]\n';
    report += '  3. [Add key finding]\n';
  }
  
  report += '\n───────────────────────────────────────────────────\n';
  report += 'RECOMMENDATIONS\n';
  report += '───────────────────────────────────────────────────\n\n';
  report += '  • [Add strategic recommendation]\n';
  report += '  • [Add tactical recommendation]\n';
  report += '  • [Add operational recommendation]\n\n';
  report += '───────────────────────────────────────────────────\n';
  report += 'NEXT STEPS\n';
  report += '───────────────────────────────────────────────────\n\n';
  report += '  □ Review findings with stakeholders\n';
  report += '  □ Develop action plan\n';
  report += '  □ Schedule follow-up meeting\n\n';
  report += '═══════════════════════════════════════════════════\n';
  report += '                  END OF REPORT\n';
  report += '═══════════════════════════════════════════════════\n';

  return report;
}

function generateTechnicalReport(topic: string, details: string[]): string {
  let report = '┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓\n';
  report += '┃           TECHNICAL DOCUMENTATION               ┃\n';
  report += '┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛\n\n';
  report += 'Document: ' + topic + '\n';
  report += 'Version: 1.0\n';
  report += 'Date: ' + new Date().toISOString().split('T')[0] + '\n';
  report += 'Author: [Author Name]\n\n';
  report += '┌─────────────────────────────────────────────────┐\n';
  report += '│ TABLE OF CONTENTS                               │\n';
  report += '├─────────────────────────────────────────────────┤\n';
  report += '│ 1. Introduction                                 │\n';
  report += '│ 2. Technical Overview                           │\n';
  report += '│ 3. Implementation Details                       │\n';
  report += '│ 4. Testing & Validation                         │\n';
  report += '│ 5. Conclusion                                   │\n';
  report += '└─────────────────────────────────────────────────┘\n\n';
  report += '1. INTRODUCTION\n';
  report += '═══════════════\n\n';
  report += 'This document provides technical specifications for ' + topic + '.\n\n';
  report += '2. TECHNICAL OVERVIEW\n';
  report += '═════════════════════\n\n';
  report += 'Architecture:\n';
  report += '  ┌─────────┐    ┌─────────┐    ┌─────────┐\n';
  report += '  │ Input   │───▶│ Process │───▶│ Output  │\n';
  report += '  └─────────┘    └─────────┘    └─────────┘\n\n';
  
  if (details.length > 0) {
    report += 'Key Components:\n';
    details.forEach((detail, i) => {
      report += '  • ' + detail + '\n';
    });
    report += '\n';
  }
  
  report += '3. IMPLEMENTATION DETAILS\n';
  report += '═════════════════════════\n\n';
  report += '  [Add implementation specifics]\n\n';
  report += '4. TESTING & VALIDATION\n';
  report += '═══════════════════════\n\n';
  report += '  Test Results: [PENDING]\n';
  report += '  Coverage: [TBD]%\n\n';
  report += '5. CONCLUSION\n';
  report += '═════════════\n\n';
  report += '  [Add conclusion]\n\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  report += '                 END OF DOCUMENT\n';
  report += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

  return report;
}

export const reportBuilder: BuiltInSkill = {
  id: 'report-builder',
  name: 'Report Builder',
  description: 'Generate professional reports in seconds. Create executive summaries, technical docs, and custom reports.',
  version: '1.0.0',
  author: 'SecureAgent',
  icon: '📑',
  category: 'data',
  installCount: 2134,
  rating: 4.4,
  commands: [
    {
      name: 'executive',
      description: 'Generate an executive summary',
      usage: 'report executive <topic> [key points]',
      examples: ['report executive "Q4 Performance" "Revenue up 15%, New markets entered, Team expanded"']
    },
    {
      name: 'technical',
      description: 'Generate a technical document',
      usage: 'report technical <topic> [details]',
      examples: ['report technical "API Documentation" "REST endpoints, Authentication, Rate limiting"']
    },
    {
      name: 'custom',
      description: 'Build a custom report',
      usage: 'report custom <type> <title>',
      examples: ['report custom status "Weekly Status Update"']
    }
  ],

  async execute(action: string, params: Record<string, unknown>): Promise<SkillExecuteResult> {
    switch (action) {
      case 'executive': {
        const fullArgs = Object.values(params).join(' ');
        const topicMatch = fullArgs.match(/"([^"]+)"|(\S+)/);
        const topic = topicMatch ? (topicMatch[1] || topicMatch[2]) : 'Untitled Report';
        
        const remaining = fullArgs.slice(fullArgs.indexOf(topic) + topic.length);
        const pointsMatch = remaining.match(/"([^"]+)"/);
        const keyPoints = pointsMatch 
          ? pointsMatch[1].split(/[,;]/).map(p => p.trim())
          : [];

        const report = generateExecutiveSummary(topic, keyPoints);

        state.savedReports.push({
          title: topic,
          type: 'executive',
          content: report,
          savedAt: new Date()
        });

        return {
          success: true,
          message: '📑 EXECUTIVE SUMMARY GENERATED\n\n' + report
        };
      }

      case 'technical': {
        const fullArgs = Object.values(params).join(' ');
        const topicMatch = fullArgs.match(/"([^"]+)"|(\S+)/);
        const topic = topicMatch ? (topicMatch[1] || topicMatch[2]) : 'Technical Document';
        
        const remaining = fullArgs.slice(fullArgs.indexOf(topic) + topic.length);
        const detailsMatch = remaining.match(/"([^"]+)"/);
        const details = detailsMatch 
          ? detailsMatch[1].split(/[,;]/).map(d => d.trim())
          : [];

        const report = generateTechnicalReport(topic, details);

        state.savedReports.push({
          title: topic,
          type: 'technical',
          content: report,
          savedAt: new Date()
        });

        return {
          success: true,
          message: '📑 TECHNICAL DOCUMENT GENERATED\n\n' + report
        };
      }

      case 'custom': {
        const type = (params.arg0 as string) || 'general';
        const title = Object.values(params).slice(1).join(' ').replace(/^["']|["']$/g, '') || 'Custom Report';

        let report = '╔══════════════════════════════════════════════════╗\n';
        report += '║            ' + type.toUpperCase().padEnd(17) + ' REPORT            ║\n';
        report += '╠══════════════════════════════════════════════════╣\n';
        report += '║ Title: ' + title.substring(0, 40).padEnd(40) + ' ║\n';
        report += '║ Date: ' + new Date().toLocaleDateString().padEnd(41) + ' ║\n';
        report += '║ Type: ' + type.padEnd(41) + ' ║\n';
        report += '╚══════════════════════════════════════════════════╝\n\n';

        switch (type.toLowerCase()) {
          case 'status':
            report += 'PROJECT STATUS\n';
            report += '══════════════\n\n';
            report += '✅ Completed:\n  • [Add completed items]\n\n';
            report += '🔄 In Progress:\n  • [Add in-progress items]\n\n';
            report += '📋 Upcoming:\n  • [Add upcoming items]\n\n';
            report += '⚠️ Blockers:\n  • [Add blockers if any]\n';
            break;

          case 'meeting':
            report += 'MEETING NOTES\n';
            report += '═════════════\n\n';
            report += 'Attendees: [List attendees]\n\n';
            report += 'Agenda:\n  1. [Topic 1]\n  2. [Topic 2]\n\n';
            report += 'Discussion:\n  [Add notes]\n\n';
            report += 'Action Items:\n  □ [Action 1] - Owner\n  □ [Action 2] - Owner\n';
            break;

          default:
            report += 'CONTENT\n';
            report += '═══════\n\n';
            report += '[Add your report content here]\n\n';
            report += 'SUMMARY\n';
            report += '═══════\n\n';
            report += '[Add summary]\n';
        }

        report += '\n────────────────────────────────────────────────────\n';
        report += '                    END OF REPORT\n';

        state.savedReports.push({
          title,
          type,
          content: report,
          savedAt: new Date()
        });

        return {
          success: true,
          message: '📑 CUSTOM REPORT GENERATED\n\n' + report
        };
      }

      default:
        return {
          success: false,
          message: 'Unknown command: ' + action + '. Available commands: executive, technical, custom'
        };
    }
  }
};

export default reportBuilder;
