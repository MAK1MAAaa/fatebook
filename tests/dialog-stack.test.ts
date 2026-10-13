import { describe, expect, it, vi } from 'vitest';
import { dialogCount, dialogPosition, isTopDialog, pushDialog, restoreDialogFocus, subscribeDialogs } from '../src/components/ui/dialog-stack';

describe('统一弹层栈', () => {
  it('确认按钮被删除或禁用时，焦点回到上一弹层', () => {
    const workshop = Symbol('workshop'), confirm = Symbol('confirm');
    const content = { isConnected: true, focus: vi.fn(), matches: () => false, closest: () => null };
    const opener = { isConnected: true, focus: vi.fn(), matches: () => false, closest: () => null };
    const closeWorkshop = pushDialog(workshop, content), closeConfirm = pushDialog(confirm);
    expect(restoreDialogFocus(confirm, opener)).toBe(true); expect(opener.focus).toHaveBeenCalledOnce();
    opener.isConnected = false;
    expect(restoreDialogFocus(confirm, opener)).toBe(true); expect(content.focus).toHaveBeenCalledOnce();
    closeConfirm(); closeWorkshop();
    expect(restoreDialogFocus(confirm, null)).toBe(false);
  });
  it('仅顶层接收输入，返回后恢复上一层，全部关闭后恢复战术栏', () => {
    const listener = vi.fn(), unsubscribe = subscribeDialogs(listener);
    const workshop = Symbol('workshop'), detail = Symbol('detail'), confirm = Symbol('confirm');
    const closeWorkshop = pushDialog(workshop), closeDetail = pushDialog(detail), closeConfirm = pushDialog(confirm);
    expect(dialogCount()).toBe(3); expect(dialogPosition(confirm)).toBe(2);
    expect(isTopDialog(workshop)).toBe(false); expect(isTopDialog(confirm)).toBe(true);
    closeConfirm(); expect(isTopDialog(detail)).toBe(true);
    closeDetail(); expect(isTopDialog(workshop)).toBe(true);
    closeWorkshop(); expect(dialogCount()).toBe(0);
    closeWorkshop(); expect(dialogCount()).toBe(0); expect(listener).toHaveBeenCalledTimes(6);
    unsubscribe();
  });
});
