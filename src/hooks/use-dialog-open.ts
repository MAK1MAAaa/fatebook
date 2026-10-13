import { useSyncExternalStore } from 'react';
import { dialogCount, subscribeDialogs } from '../components/ui/dialog-stack';

export function useDialogOpen() {
  return useSyncExternalStore(subscribeDialogs, dialogCount, () => 0) > 0;
}
