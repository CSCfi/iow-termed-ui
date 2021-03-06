import { Pipe, PipeTransform } from '@angular/core';
import { stripMarkdown } from '../utils/markdown';

@Pipe({ name: 'stripMarkdown' })
export class StripMarkdownPipe implements PipeTransform {

  transform(md: string): string {
    return stripMarkdown(md);
  }
}
