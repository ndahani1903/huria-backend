// src/modules/social-v2/utils/mention.util.ts

export class MentionUtil {
  private static readonly MENTION_REGEX = /@(\w+)/g;

  static extract(text: string): string[] {
    if (!text) return [];
    const matches = text.match(this.MENTION_REGEX);
    if (!matches) return [];
    return matches.map((mention) => mention.slice(1));
  }

  static format(text: string): string {
    return text.replace(this.MENTION_REGEX, (match) => {
      const username = match.slice(1);
      return `@${username}`;
    });
  }

  static isValidUsername(username: string): boolean {
    return /^[a-zA-Z0-9._]+$/.test(username);
  }
} 