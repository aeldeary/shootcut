import { useState, type DragEvent } from 'react';

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = list.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Native drag-and-drop reordering for a list of items with string ids. */
export function useDragReorder<T extends { id: string }>(items: T[], onChange: (next: T[]) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const end = () => {
    setDragId(null);
    setOverId(null);
  };

  const bind = (id: string) => ({
    draggable: true,
    onDragStart: (e: DragEvent) => {
      setDragId(id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', id);
    },
    onDragOver: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (overId !== id) setOverId(id);
    },
    onDrop: (e: DragEvent) => {
      if (!dragId) return;
      e.preventDefault();
      const from = items.findIndex((i) => i.id === dragId);
      const to = items.findIndex((i) => i.id === id);
      onChange(moveItem(items, from, to));
      end();
    },
    onDragEnd: end,
  });

  return { dragId, overId, bind };
}
