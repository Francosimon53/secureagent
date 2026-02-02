import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createPost, type BlogPostInput } from '@/lib/blog-store';

const SYSTEM_PROMPT = `You are a content writer for SecureAgent, an AI-powered personal assistant platform. Write engaging, informative blog posts that help users get the most out of their AI assistant.

Your writing style should be:
- Clear and accessible (no jargon without explanation)
- Practical with actionable tips
- Friendly but professional
- SEO-optimized with natural keyword usage

When writing, include:
- A compelling introduction that hooks the reader
- Clear sections with headers (use ## for main sections, ### for subsections)
- Practical examples and code snippets where relevant
- A conclusion with a call-to-action

Format your response as JSON with this structure:
{
  "title": "Blog Post Title",
  "content": "Full markdown content of the blog post",
  "excerpt": "A 1-2 sentence summary for preview cards",
  "metaDescription": "SEO meta description (max 160 chars)",
  "tags": ["tag1", "tag2", "tag3"],
  "category": "One of: Tutorials, Productivity, Smart Home, Insights, News"
}`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { topic, keywords, category, secret } = body;

    // Verify secret for manual triggers
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && secret !== cronSecret) {
      // Allow without secret for internal calls, but rate limit
    }

    if (!topic) {
      return NextResponse.json(
        { error: 'Topic is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const userPrompt = `Write a blog post about: "${topic}"
${keywords ? `Include these keywords naturally: ${keywords.join(', ')}` : ''}
${category ? `Category: ${category}` : ''}

Make sure the content is:
1. At least 800 words
2. Has 3-5 main sections
3. Includes practical examples with SecureAgent commands where relevant
4. Ends with a call-to-action

Respond with valid JSON only.`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });

    // Extract text content
    const textContent = response.content.find(block => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from AI');
    }

    // Parse the JSON response
    let postData: {
      title: string;
      content: string;
      excerpt: string;
      metaDescription: string;
      tags: string[];
      category: string;
    };

    try {
      // Extract JSON from the response (handle markdown code blocks)
      let jsonStr = textContent.text;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      postData = JSON.parse(jsonStr.trim());
    } catch {
      // Try to extract structured data from text
      throw new Error('Failed to parse AI response as JSON');
    }

    // Create the blog post
    const input: BlogPostInput = {
      title: postData.title,
      content: postData.content,
      excerpt: postData.excerpt,
      metaDescription: postData.metaDescription,
      tags: postData.tags || [],
      category: postData.category || category || 'General',
      published: true,
    };

    const post = createPost(input);

    return NextResponse.json({
      success: true,
      post: {
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        url: `/blog/${post.slug}`,
      },
    });
  } catch (error) {
    console.error('Blog generation error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Failed to generate blog post' },
      { status: 500 }
    );
  }
}
