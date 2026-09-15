// src/modules/social-v2/utils/hashtag.util.ts

export class HashtagUtil {
  private static readonly HASHTAG_REGEX = /#(\w+)/g;

  static extract(text: string): string[] {
    if (!text) return [];
    const matches = text.match(this.HASHTAG_REGEX);
    if (!matches) return [];
    return matches.map((tag) => tag.slice(1).toLowerCase());
  }

  static normalize(tag: string): string {
    return tag.toLowerCase().trim();
  }

  static isValid(tag: string): boolean {
    return /^[a-zA-Z0-9_]+$/.test(tag);
  }

  static format(text: string): string {
    return text.replace(this.HASHTAG_REGEX, (match) => {
      const tag = match.slice(1);
      return `#${tag}`;
    });
  }
} 