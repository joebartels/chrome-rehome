import { afterEach, expect, test, vi } from 'vitest';
import type { RecentTabRow } from '../../src/browser/recent-tabs';
import { mountRecentTabs } from '../../src/popup/recent-tabs';

type Row = RecentTabRow;

function harness() {
  const document = { activeElement: undefined as Element | undefined, createElement: (tag: string) => new Element(tag) };
  class Element {
    children: Element[] = [];
    parent?: Element | undefined;
    ownerDocument = document;
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    events = new Map<string, () => void>();
    textContent = '';
    hidden = false;
    constructor(readonly tag: string) {}
    focus() { document.activeElement = this; }
    setAttribute(name: string, value: string) { this.attributes[name] = value; }
    addEventListener(name: string, listener: () => void) { this.events.set(name, listener); }
    removeEventListener(name: string) { this.events.delete(name); }
    click() { this.events.get('click')?.(); }
    get firstElementChild() { return this.children[0]; }
    get nextElementSibling() {
      return this.parent?.children[this.parent.children.indexOf(this) + 1];
    }
    append(...children: Element[]) { for (const child of children) this.insertBefore(child, null); }
    insertBefore(child: Element, cursor: Element | null) {
      child.remove();
      const index = cursor ? this.children.indexOf(cursor) : this.children.length;
      this.children.splice(index, 0, child);
      child.parent = this;
    }
    remove() {
      if (!this.parent) return;
      if (document.activeElement === this || this.children.includes(document.activeElement!)) document.activeElement = undefined;
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = undefined;
    }
  }
  const elements = { heading: new Element('h2'), list: new Element('ul'), status: new Element('p'), retry: new Element('button') };
  const read = vi.fn<() => Promise<readonly Row[]>>().mockResolvedValue([]);
  const focus = vi.fn<(row: Row) => Promise<boolean>>().mockResolvedValue(true);
  const close = vi.fn();
  let listener: (() => void) | undefined;
  const browser = {
    read, focus, subscribe(refresh: () => void) { listener = refresh; return () => { listener = undefined; }; },
  };
  function mount() {
    return mountRecentTabs(elements as unknown as Parameters<typeof mountRecentTabs>[0], browser, close);
  }
  const buttons = () => elements.list.children.map(child => child.children[0]!);
  return { document, elements, read, focus, close, mount, buttons, refresh: () => listener?.() };
}
const row = (id: number, title = 'Tab ' + id): Row => ({ id, title, site: 'example.test', context: 'This window', source: { windowId: 1, incognito: false } });

afterEach(() => { vi.useRealTimers(); });

test('preserves focused row on reorder and falls back when it is removed', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.read.mockResolvedValue([row(1, '<img src=x>'), row(2)]);
  const popup = h.mount();
  await vi.advanceTimersByTimeAsync(0);
  const [one, two] = h.buttons();
  expect(one!.children[0]!.textContent).toBe('<img src=x>');
  two!.focus();
  h.read.mockResolvedValue([row(2, 'Updated'), row(1)]);
  h.refresh();
  await vi.runAllTimersAsync();
  expect(h.buttons()).toEqual([two, one]);
  expect(h.document.activeElement).toBe(two);
  expect(two!.children[0]!.textContent).toBe('Updated');

  h.read.mockResolvedValue([row(1)]);
  h.refresh();
  await vi.runAllTimersAsync();
  expect(h.document.activeElement).toBe(one);
  popup.dispose();
});

test('coalesces bursts and disposes pending work', async () => {
  vi.useFakeTimers();
  const h = harness();
  const popup = h.mount();
  await vi.advanceTimersByTimeAsync(0);
  for (let index = 0; index < 25; index++) h.refresh();
  expect(h.read).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  expect(h.read).toHaveBeenCalledTimes(2);
  h.refresh();
  popup.dispose();
  await vi.runAllTimersAsync();
  expect(h.read).toHaveBeenCalledTimes(2);
});

test('announces an unavailable destination, refreshes its row, and keeps the popup open', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.read.mockResolvedValueOnce([row(1)]);
  h.focus.mockResolvedValue(false);
  const popup = h.mount();
  await vi.advanceTimersByTimeAsync(0);
  h.buttons()[0]!.click();
  await vi.runAllTimersAsync();
  expect(h.close).not.toHaveBeenCalled();
  expect(h.elements.status.textContent).toMatch(/could not switch/i);
  expect(h.buttons()).toEqual([]);
  popup.dispose();
});

test('shows a retry after a load error and clears it after a successful load', async () => {
  vi.useFakeTimers();
  const h = harness();
  h.read.mockRejectedValueOnce(Error('storage unavailable')).mockResolvedValue([row(1)]);
  const popup = h.mount();
  await vi.advanceTimersByTimeAsync(0);
  expect(h.elements.status.textContent).toMatch(/could not load/i);
  expect(h.elements.retry.hidden).toBe(false);
  h.elements.retry.click();
  await vi.runAllTimersAsync();
  expect(h.buttons()).toHaveLength(1);
  expect(h.elements.retry.hidden).toBe(true);
  h.buttons()[0]!.click();
  await vi.runAllTimersAsync();
  expect(h.close).toHaveBeenCalledOnce();
  popup.dispose();
});
