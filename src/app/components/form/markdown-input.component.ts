import { Component, ElementRef, forwardRef, OnInit, ViewChild } from '@angular/core';
import { NG_VALUE_ACCESSOR, ControlValueAccessor } from '@angular/forms';

import { Node as MarkdownNode, Parser } from 'commonmark';
import { DomPath, DomPoint, DomSelection, formatTextContent, moveCursor, removeChildren } from '../../utils/dom';
import { insertBefore, nextOf, nextOfMapped, previousOf, previousOfMapped, remove } from '../../utils/array';
import { children } from '../../utils/markdown';
import { wordAtOffset } from '../../utils/string';
import { isDefined, requireDefined } from '../../utils/object';

class Model {

  public content: Paragraph[] = [];

  linkableSelection: LinkableSelection|null = null;
  linkedSelection: LinkedSelection|null = null;

  constructor(public node: Element) {
    removeChildren(node);
  }

  static ofMarkdown(container: HTMLElement, documentNode: MarkdownNode): Model {

    if (documentNode.type !== 'document') {
      throw new Error('Not an document, was: ' + documentNode.type);
    }

    const result = new Model(container);

    for (const paragraphNode of children(documentNode)) {
      result.addParagraph(Paragraph.ofMarkdown(result, paragraphNode));
    }

    return result;
  }

  private addParagraph(paragraph: Paragraph) {
    this.content.push(paragraph);
    this.node.appendChild(paragraph.node);
  }

  private insertParagraphBefore(newParagraph: Paragraph, ref: Paragraph) {
    insertBefore(this.content, newParagraph, ref);
    this.node.insertBefore(newParagraph.node, ref.node);
  }

  insertNewParagraph() {

    const selection = this.getSelection();

    if (selection.isRange()) {
      selection.remove();
    }

    const {text, offset} = selection.start;
    const newParagraph = new Paragraph(this);
    this.insertParagraphBefore(newParagraph, text.containingParagraph);
    Model.moveCursor(text.containingParagraph.splitTo(newParagraph, text, offset));
  }

  insertChar(char: string) {

    const selection = this.getSelection();

    if (selection.isRange()) {
      selection.remove();
    }

    const {text, offset} = selection.start;
    Model.moveCursor(text.insertChar(char, offset));
  }

  removeNextChar() {

    const selection = this.getSelection();

    if (selection.isRange()) {
      Model.moveCursor(selection.remove());
    } else {
      const {text, offset} = selection.start;
      Model.moveCursor(text.removeNextChar(offset));
    }
  }

  removePreviousChar() {

    const selection = this.getSelection();

    if (selection.isRange()) {
      Model.moveCursor(selection.remove());
    } else {
      const {text, offset} = selection.start;
      Model.moveCursor(text.removePreviousChar(offset));
    }
  }

  findTextForPath(indicesFromRoot: number[]): Text {
    const index = indicesFromRoot.shift()!;
    return this.content[index].findTextForPath(indicesFromRoot);
  }

  getPrecedingText(paragraph: Paragraph): Text|null {

    const previous = previousOf(this.content, paragraph);

    if (previous) {
      return previous.lastText;
    } else {
      return null;
    }
  }

  getFollowingText(paragraph: Paragraph): Text|null {

    const next = nextOf(this.content, paragraph);

    if (next) {
      return next.firstText;
    } else {
      return null;
    }
  }

  removeContent(paragraph: Paragraph) {
    this.node.removeChild(paragraph.node);
    remove(this.content, paragraph);
  }

  getSelection(): Selection {

    if (this.content.length === 0) {

      const newParagraph = new Paragraph(this);
      const newText = new Text(newParagraph);
      newParagraph.addContent(newText);
      this.addParagraph(newParagraph);
      Model.moveCursor(new Point(newText, 0));
    }

    return Selection.ofDomSelection(this, new DomSelection(this.node));
  }

  private static moveCursor(point: Point|null) {
    if (point) {
      moveCursor(point.text.node, point.offset);
    }
  }

  link(target: string) {

    if (this.linkableSelection === null) {
      throw new Error('Illegal state');
    }

    const { start, end, cursor } = this.linkableSelection;
    const paragraph = this.linkableSelection.paragraph;
    const text = this.linkableSelection.text;
    const selectionAsLink = new Link(paragraph, this.linkableSelection.content, target);

    if (start > 0) {
      paragraph.addContentBefore(new Text(paragraph, text.content.substring(0, start)), text);
    }

    paragraph.addContentBefore(selectionAsLink, text);

    if (end < text.length) {
      paragraph.addContentBefore(new Text(paragraph, text.content.substring(end, text.length)), text);
    }

    text.remove();

    Model.moveCursor(new Point(selectionAsLink.text, cursor - start));
    this.updateSelection();
  }

  unlink() {

    if (this.linkedSelection === null) {
      throw new Error('Illegal state');
    }

    const paragraph = this.linkedSelection.paragraph;
    const link = this.linkedSelection.link;
    const linkAsText = new Text(paragraph, link.content);

    paragraph.addContentBefore(linkAsText, link);
    link.remove();
    paragraph.mergeConsecutiveTexts(new Point(linkAsText, this.linkedSelection.cursor));
    this.updateSelection();
  }

  updateSelection() {
    const selection = this.getSelection();
    this.linkableSelection = selection.linkable;
    this.linkedSelection = selection.link;
  }

  removeLinkSelections() {
    this.linkableSelection = null;
    this.linkedSelection = null;
  }

  toMarkdown(): string {
    return this.content.map(c => c.toMarkdown()).join('').trim();
  }

  removeStartOfLine() {
    console.log('remove start of line, not implemented yet'); // TODO
  }

  removeEndOfLine() {
    console.log('remove rest of line, not implemented yet'); // TODO
  }

  removeNextWord() {
    console.log('remove next word, not implemented yet'); // TODO
  }

  removePreviousWord() {
    console.log('remove previous word, not implemented yet'); // TODO
  }

  undo() {
    console.log('undo, not implemented yet');  // TODO
  }

  redo() {
    console.log('redo, not implemented yet');  // TODO
  }

  paste() {
    console.log('paste, not implemented yet');  // TODO
  }

  cut() {
    console.log('cut, not implemented yet');  // TODO
  }

  copy() {
    console.log('copy, not implemented yet');  // TODO
  }
}

class Paragraph {

  node: HTMLElement;

  constructor(private parent: Model, private content: (Link|Text)[] = []) {
    this.node = document.createElement('p');
  }

  static ofMarkdown(parent: Model, paragraphNode: MarkdownNode): Paragraph {

    if (paragraphNode.type !== 'paragraph') {
      throw new Error('Not a paragraph, was: ' + paragraphNode.type);
    }

    const result = new Paragraph(parent);

    for (const child of children(paragraphNode)) {
      result.addContent(child.type === 'link' ? Link.ofMarkdown(result, child) : Text.ofMarkdown(result, child));
    }

    return result;
  }

  combineWith(paragraph: Paragraph): Point|null {

    if (paragraph === this) {
      // nothing to do
      return null;
    }

    const lastOfThis = this.content[this.content.length - 1];
    const lastContentBeforeChanges = lastOfThis.text.content;

    let firstChild = true;

    for (const content of paragraph.content) {

      if (firstChild && lastOfThis instanceof Text && content instanceof Text) {

        if (lastOfThis.content.trim() !== '') {
          lastOfThis.append(content.content);
        } else {
          lastOfThis.content = content.content;
        }
      } else {
        this.addContent(content.copyToParent(this));
      }

      firstChild = false;
    }

    paragraph.remove();
    return new Point(lastOfThis.text, lastContentBeforeChanges.trim() === '' ? 0 : lastContentBeforeChanges.length);
  }

  splitTo(prependingParagraph: Paragraph, fromText: Text, fromOffset: number): Point {

    const contentToRemove: (Link|Text)[] = [];

    for (const content of this.content) {

      const isSplittingText = content.text === fromText;

      if (isSplittingText) {
        const contentText = content.content;
        prependingParagraph.appendText(contentText.substring(0, fromOffset));
        content.content = contentText.substring(fromOffset, fromText.length);
        break; // nothing to do after split point is handled
      }

      prependingParagraph.addContent(content.copyToParent(prependingParagraph));
      contentToRemove.push(content);
    }

    for (const content of contentToRemove) {
      content.remove();
    }

    if (prependingParagraph.empty) {
      prependingParagraph.addContent(new Text(prependingParagraph));
    }

    return new Point(this.firstText, 0);
  }

  appendText(text: string) {
    if (this.content.length > 0 && this.lastContent instanceof Text) {
      this.lastContent.append(text);
    } else {
      this.addContent(new Text(this, text));
    }
  }

  mergeConsecutiveTexts(cursor: Point) {

    let cursorAfterMerging = cursor;

    if (this.content.length < 2) {
      // nothing to do
    } else {

      let i = 1;

      while (i < this.content.length) {

        const previous = this.content[i-1];
        const current = this.content[i];

        if (previous instanceof Text && current instanceof Text) {

          const previousLengthBeforeAppending = previous.length;
          previous.append(current.content);

          if (cursor.text === current) {
            cursorAfterMerging = new Point(previous, previousLengthBeforeAppending + cursorAfterMerging.offset);
          }

          current.remove();
        } else {
          i++;
        }
      }
    }

    moveCursor(cursorAfterMerging.text.node, cursorAfterMerging.offset);
  }

  addContent(content: Link|Text) {
    this.content.push(content);
    this.node.appendChild(content.node);
  }

  addContentBefore(content: Link|Text, ref: Link|Text) {
    insertBefore(this.content, content, ref);
    this.node.insertBefore(content.node, ref.node);
  }

  get paragraph(): Paragraph {
    return this;
  }

  get empty() {
    return this.content.length === 0;
  }

  remove() {
    this.parent.removeContent(this);
  }

  removeContent(content: Text|Link): void {
    if (this.content.length === 1) {
      this.parent.removeContent(this);
    } else {
      this.node.removeChild(content.node);
      remove(this.content, content);
    }
  }

  findTextForPath(indicesFromRoot: number[]): Text {
    const index = indicesFromRoot.shift()!;
    return this.content[index].findTextForPath(indicesFromRoot);
  }

  getPrecedingText(text: Text): Text|null {

    const previous = previousOfMapped(this.content, c => c.text, text);

    if (previous) {
      return previous.text;
    } else {
      return this.parent.getPrecedingText(this);
    }
  }

  getFollowingText(text: Text): Text|null {

    const next = nextOfMapped(this.content, c => c.text, text);

    if (next) {
      return next.text;
    } else {
      return this.parent.getFollowingText(this);
    }
  }

  get lastContent(): Text|Link {
    if (this.content.length === 0) {
      throw new Error('No content in paragraph');
    }

    return this.content[this.content.length - 1];
  }

  get lastText(): Text {
    return this.lastContent.text;
  }

  get firstContent(): Text|Link {
    if (this.content.length === 0) {
      throw new Error('No content in paragraph');
    }

    return this.content[0];
  }

  get firstText(): Text {
    return this.firstContent.text;
  }

  toMarkdown(): string {
    return '\n\n' + this.content.map(c => c.toMarkdown()).join('');
  }
}

class Link {

  private _text: Text;
  private _target: string;
  node: HTMLElement;

  constructor(private parent: Paragraph, text: string, target: string) {
    this.node = document.createElement('span');
    this.node.classList.add('link');
    this.text = new Text(this, text);
    this.target = target;
  }

  static ofMarkdown(parent: Paragraph, link: MarkdownNode): Link {

    if (link.type !== 'link') {
      throw new Error('Not a paragraph, was: ' + link.type);
    }

    const text = children(link);

    if (text.length !== 1) {
      throw new Error('Not a single child, was: ' + text.length);
    }

    return new Link(parent, text[0].literal, link.destination);
  }

  copyToParent(parent: Paragraph): Link {
    return new Link(parent, this.content, this.target);
  }

  get content() {
    return this.text.content;
  }

  set content(value: string) {
    this.text.content = value;
  }

  get text() {
    return this._text;
  }

  set text(value: Text) {

    this._text = value;

    for (const child of Array.from(this.node.childNodes.values())) {
      this.node.removeChild(child);
    }

    this.node.appendChild(value.node);
  }

  get target() {
    return this._target;
  }

  set target(value: string) {
    this._target = value;
    this.node.dataset['target'] = value;
  }

  remove(): void {
    this.parent.removeContent(this);
  }

  removeContent(text: Text): void {

    if (text !== this.text) {
      throw new Error('Illegal argument');
    }

    this.remove();
  }

  findTextForPath(indicesFromRoot: number[]): Text {
    const index = indicesFromRoot.shift()!;

    if (index !== 0 || indicesFromRoot.length !== 0) {
      throw new Error('Illegal state');
    }

    return this.text;
  }

  getPrecedingText(): Text|null {
    return this.parent.getPrecedingText(this.text);
  }

  getFollowingText(): Text|null {
    return this.parent.getFollowingText(this.text);
  }

  get paragraph(): Paragraph {
    return this.parent;
  }

  toMarkdown(): string {
    return `[${this.content}](${this.target})`;
  }
}

class Text {

  private _content: string;
  node: Node;

  constructor(public parent: Paragraph|Link, content = '') {
    this.node = document.createTextNode('');
    this.content = content;
  }

  static ofMarkdown(parent: Paragraph|Link, text: MarkdownNode): Text {

    if (text.type !== 'text') {
      throw new Error('Not a text, was: ' + text.type);
    }

    return new Text(parent, text.literal);
  }

  copyToParent(parent: Paragraph): Text {
    return new Text(parent, this.content);
  }

  get content(): string {
    return this._content;
  }

  set content(value: string) {
    this._content = value || ' ';
    this.node.textContent = formatTextContent(this.content);
  }

  get text() {
    return this;
  }

  get containingParagraph(): Paragraph {
    return this.parent.paragraph;
  }

  get length() {
    return this.content.length;
  }

  isInLink() {
    return this.parent instanceof Link;
  }

  remove(): Point|null {

    const previous = this.getPrecedingText();

    // FIXME: typescript won't type check without this no-op type guard
    if (this.parent instanceof Paragraph ) {
      this.parent.removeContent(this);
    } else {
      this.parent.removeContent(this);
    }

    if (previous) {
      return new Point(previous.text, previous.text.length);
    } else {
      return null;
    }
  }

  removeNextChar(offset: number): Point|null {

    if (offset >= this.content.length) {
      const next = this.getFollowingText();

      if (next) {
        if (next.containingParagraph !== this.containingParagraph) {
          return this.containingParagraph.combineWith(next.containingParagraph);
        } else {
          return next.removeFirstCharacter();
        }
      } else {
        return null;
      }
    } else {
      return this.removeRange(offset, offset + 1);
    }
  }

  removePreviousChar(offset: number): Point|null {

    if (offset <= 0) {
      const previous = this.getPrecedingText();

      if (previous) {
        if (previous.containingParagraph !== this.containingParagraph) {
          return previous.containingParagraph.combineWith(this.containingParagraph);
        } else {
          return previous.removeLastCharacter();
        }
      } else {
        return null;
      }
    } else {
      return this.removeRange(offset - 1, offset);
    }
  }

  removeAfter(offset: number): Point|null {
    return this.removeRange(offset, this.content.length);
  }

  removeBefore(offset: number): Point|null {
    return this.removeRange(0, offset);
  }

  removeLastCharacter(): Point|null {

    if (this.content.length <= 1) {
      return this.remove();
    } else {
      return this.removeRange(this.content.length - 1, this.content.length);
    }
  }

  removeFirstCharacter(): Point|null {
    if (this.content.length <= 1) {
      return this.remove();
    } else {
      return this.removeRange(0, 1);
    }
  }

  removeRange(start: number, end: number): Point|null {

    if (start < 0 || end > this.content.length) {
      throw new Error('remove range not in bounds, ' + start + ' .. ' + end + ' of [' + this.content + '] (' + this.content.length + ')');
    }

    if (start === 0 && end === this.content.length) {
      return this.remove();
    } else {
      const beforeStart = this.content.substring(0, start);
      const afterEnd = this.content.substring(end);
      this.content = beforeStart + afterEnd;

      return new Point(this, start);
    }
  }

  insertChar(char: string, offset: number): Point {

    const start = this.content.substring(0, offset);
    const end = this.content.substring(offset, this.content.length);
    this.content = start + char + end;

    return new Point(this, offset + 1)
  }

  append(text: string) {
    this.content = this.content + text;
  }

  findTextForPath(indicesFromRoot: number[]): Text {

    if (indicesFromRoot.length !== 0) {
      throw new Error('Illegal state');
    }

    return this;
  }

  getPrecedingText(): Text|null {
    if (this.parent instanceof Paragraph) {
      return this.parent.getPrecedingText(this);
    } else {
      return this.parent.getPrecedingText();
    }
  }

  getFollowingText(): Text|null {
    if (this.parent instanceof Paragraph) {
      return this.parent.getFollowingText(this);
    } else {
      return this.parent.getFollowingText();
    }
  }

  toMarkdown(): string {
    return this.content;
  }
}


class Point {
  constructor(public text: Text, public offset: number) {
  }
}

class Selection {

  textBetween: Text[] = [];

  constructor(private model: Model, public start: Point, public end: Point) {

    if (this.start.text !== this.end.text) {
      for (let t = this.end.text.getPrecedingText()!; t !== this.start.text; t = t.getPrecedingText()!) {
        this.textBetween.push(t);
      }
    }
  }

  static ofDomSelection(model: Model, domSelection: DomSelection): Selection {

    function createPoint(domPoint: DomPoint) {

      const indicesFromRoot = domPoint.path.indicesFromRoot;
      const text = model.findTextForPath(indicesFromRoot);

      return new Point(text, domPoint.offset);
    }

    return new Selection(model, createPoint(domSelection.start), createPoint(domSelection.end));
  }

  private isLinkable() {
    return this.start.text === this.end.text && !this.start.text.isInLink();
  }

  private isLink() {
    return this.start.text === this.end.text && this.start.text.isInLink();
  }

  get link(): LinkedSelection|null {
    if (this.isLink()) {
      return new LinkedSelection(this.end.text.parent as Link, this.end.offset);
    } else {
      return null;
    }
  }

  get linkable(): LinkableSelection|null {
    if (this.isLinkable()) {
      if (this.isRange()) {
        return new LinkableSelection(this.start.text, this.start.offset, this.end.offset, this.end.offset);
      } else {

        const wordRange = wordAtOffset(this.start.text.content, this.start.offset);

        if (wordRange) {
          return new LinkableSelection(this.start.text, wordRange.start, wordRange.end, this.end.offset);
        } else {
          return null;
        }
      }
    } else {
      return null;
    }
  }

  isRange() {
    return this.start.text !== this.end.text || this.start.offset !== this.end.offset;
  }

  remove(): Point|null {

    if (this.start.text !== this.end.text) {

      for (const text of this.textBetween) {
        text.remove();
      }

      this.start.text.removeAfter(this.start.offset);
      this.end.text.removeBefore(this.end.offset);
      this.start.text.containingParagraph.combineWith(this.end.text.containingParagraph);

      return new Point(this.start.text, this.start.offset);
    } else {
      return this.start.text.removeRange(this.start.offset, this.end.offset);
    }
  }

  toString() {
    const createDomPath = (point: Point) => new DomPath(this.model.node, point.text.node);
    return `From ${createDomPath(this.start).toString()}(${this.start.offset}) to ${createDomPath(this.end).toString()}(${this.end.offset})`;
  }
}

class LinkableSelection {

  constructor(public text: Text, public start: number, public end: number, public cursor: number) {
  }

  get content() {
    return this.text.content.substring(this.start, this.end);
  }

  get paragraph() {
    return this.text.containingParagraph;
  }
}

class LinkedSelection {

  constructor(public link: Link, public cursor: number) {
  }

  get content() {
    return this.link.content;
  }

  get paragraph() {
    return this.link.paragraph;
  }
}

const keyCodes = {
  backspace: 8,
  enter: 13,
  del: 46,
  a: 65,
  b: 66,
  c: 67,
  d: 68,
  h: 72,
  i: 73,
  k: 75,
  u: 85,
  v: 86,
  x: 88,
  y: 89,
  z: 90
};

function isAlt(event: KeyboardEvent, keyCode?: number) {
  return !event.metaKey && !event.ctrlKey && event.altKey && (isDefined(keyCode) ? event.keyCode === keyCode : true);
}

function isCtrl(event: KeyboardEvent, keyCode?: number) {
  return !event.metaKey && event.ctrlKey && !event.altKey && (isDefined(keyCode) ? event.keyCode === keyCode : true);
}

function isMeta(event: KeyboardEvent, keyCode?: number) {
  return event.metaKey && !event.ctrlKey && !event.altKey && (isDefined(keyCode) ? event.keyCode === keyCode : true);
}

function isPlain(event: KeyboardEvent, keyCode?: number) {
  return !event.metaKey && !event.ctrlKey && !event.altKey && (isDefined(keyCode) ? event.keyCode === keyCode : true);
}

function isUndo(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.z) || isMeta(event, keyCodes.z);
}

function isRedo(event: KeyboardEvent) {
  return (isMeta(event, keyCodes.z) && event.shiftKey) || isCtrl(event, keyCodes.y);
}

function isBoldCommand(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.b) || isMeta(event, keyCodes.b);
}

function isItalicCommand(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.i) || isMeta(event, keyCodes.i);
}

function isUnderlineCommand(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.u) || isMeta(event, keyCodes.u);
}

function isRemovePreviousChar(event: KeyboardEvent) {
  return isPlain(event, keyCodes.backspace) || isCtrl(event, keyCodes.h);
}

function isRemoveNextChar(event: KeyboardEvent) {
  return isPlain(event, keyCodes.del) || isCtrl(event, keyCodes.d);
}

function isRemovePreviousWord(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.backspace) || isAlt(event, keyCodes.backspace);
}

function isRemoveNextWord(event: KeyboardEvent) {
  return isAlt(event, keyCodes.del);
}

function isRemoveStartOfLine(event: KeyboardEvent) {
  return isMeta(event, keyCodes.backspace);
}

function isRemoveRestOfLine(event: KeyboardEvent) {
  return isCtrl(event, keyCodes.k);
}

@Component({
  selector: 'markdown-input',
  styleUrls: ['./markdown-input.component.scss'],
  providers: [{
    provide: NG_VALUE_ACCESSOR,
    useExisting: forwardRef(() => MarkdownInputComponent),
    multi: true
  }],
  template: `
    
    <div *ngIf="hasLinkableSelection()" class="action">
      <span class="btn btn-default" (mousedown)="handleBlur = false" (click)="link()" ngbTooltip="{{'Link' | translate}}" [placement]="'left'">
        <i class="fa fa-link"></i>
      </span>
      <span class="content">{{linkableSelection.content}}</span>
    </div>

    <div *ngIf="hasLinkedSelection()" class="action">
      <span class="btn btn-default" (mousedown)="handleBlur = false" (click)="unlink()" ngbTooltip="{{'Unlink' | translate}}" [placement]="'left'">
        <i class="fa fa-unlink"></i>
      </span>
      <span class="content">{{linkedSelection.content}}</span>
    </div>
      
    <div #editable contenteditable="true"></div>
  `
})
export class MarkdownInputComponent implements OnInit, ControlValueAccessor {

  model: Model;
  handleBlur = false;
  propagateChange: (fn: any) => void = () => {};
  propagateTouched: (fn: any) => void = () => {};

  @ViewChild('editable') editableElement: ElementRef;

  ngOnInit(): void {

    const element = this.editableElement.nativeElement as HTMLElement;
    this.model = new Model(this.editableElement.nativeElement as HTMLElement);

    element.addEventListener('keydown', (event: KeyboardEvent) => {

      if (isUnderlineCommand(event)) {
        console.log('underline command prevented');
        event.preventDefault();
      } else if (isItalicCommand(event)) {
        console.log('italic command prevented');
        event.preventDefault();
      } else if (isBoldCommand(event)) {
        console.log('bold command prevented');
        event.preventDefault();
      } else if (isRemoveStartOfLine(event)) {
        this.model.removeStartOfLine();
        this.reportChange();
        event.preventDefault();
      } else if (isRemoveRestOfLine(event)) {
        this.model.removeEndOfLine();
        this.reportChange();
        event.preventDefault();
      } else if (isRemovePreviousWord(event)) {
        this.model.removePreviousWord();
        this.reportChange();
        event.preventDefault();
      } else if (isRemoveNextWord(event)) {
        this.model.removeNextWord();
        this.reportChange();
        event.preventDefault();
      } else if (isRemoveNextChar(event)) {
        this.model.removeNextChar();
        this.reportChange();
        event.preventDefault();
      } else if (isRemovePreviousChar(event)) {
        this.model.removePreviousChar();
        this.reportChange();
        event.preventDefault();
      } else if (isRedo(event)) {
        this.model.redo();
        this.reportChange();
        event.preventDefault();
      } else if (isUndo(event)) {
        this.model.undo();
        this.reportChange();
        event.preventDefault();
      } else {
        // catch rest in key press handler which handles all text appending
      }
    });

    element.addEventListener('keypress', (event: KeyboardEvent) => {

      if (event.keyCode === keyCodes.enter) {
        this.model.insertNewParagraph();
        this.reportChange();
        event.preventDefault();
      } else if (event.charCode) {
        this.model.insertChar(event.key);
        this.reportChange();
        event.preventDefault();
      }
    });

    element.addEventListener('keyup', () => {
      this.model.updateSelection();
    });

    element.addEventListener('mouseup', (event: Event) => {
      this.model.updateSelection();
      event.preventDefault();
    });

    element.addEventListener('blur', () => {

      this.handleBlur = true;

      setTimeout(() => {
        if (this.handleBlur) {
          this.model.removeLinkSelections();
        }
      }, 200);
    });

    element.addEventListener('copy', (event: Event) => {
      this.model.copy();
      this.reportChange();
      event.preventDefault();
    });

    element.addEventListener('paste', (event: Event) => {
      this.model.paste();
      this.reportChange();
      event.preventDefault();
    });

    element.addEventListener('cut', (event: Event) => {
      this.model.cut();
      this.reportChange();
      event.preventDefault();
    });
  }

  hasLinkableSelection() {
    return this.model.linkableSelection !== null;
  }

  get linkableSelection() {
    return requireDefined(this.model.linkableSelection);
  }

  hasLinkedSelection() {
    return this.model.linkedSelection !== null;
  }

  get linkedSelection() {
    return requireDefined(this.model.linkedSelection);
  }

  link() {
    this.model.link(prompt('target') || 'dummy');
    this.reportChange();
  }

  unlink() {
    this.model.unlink();
    this.reportChange();
  }

  private reportChange() {
    this.propagateChange(this.model.toMarkdown());
  }

  writeValue(obj: any): void {

    const value = obj || '';

    if (typeof value !== 'string') {
      throw new Error('Value must be a string');
    }

    const element = this.editableElement.nativeElement as HTMLElement;
    this.model = Model.ofMarkdown(element, new Parser().parse(value));
  }

  registerOnChange(fn: any): void {
    this.propagateChange = fn;
  }

  registerOnTouched(fn: any): void {
    this.propagateTouched = fn;
  }
}