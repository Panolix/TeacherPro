import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export interface ContextMenuItem {
  type?: "item";
  label: string;
  icon?: ReactNode;
  shortcut?: string;
  onClick?: () => void;
  danger?: boolean;
  active?: boolean;
  disabled?: boolean;
  submenu?: ContextMenuEntry[];
}

export interface ContextMenuDivider {
  type: "divider";
}

export interface ContextMenuSection {
  type: "section";
  label: string;
}

export interface ContextMenuColorGrid {
  type: "color-grid";
  colors: string[];
  active?: string;
  onPick: (color: string) => void;
}

export type ContextMenuEntry =
  | ContextMenuItem
  | ContextMenuDivider
  | ContextMenuSection
  | ContextMenuColorGrid;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

const VIEWPORT_PAD = 8;

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const [openSubmenuIdx, setOpenSubmenuIdx] = useState<number | null>(null);
  const submenuOpenTimer = useRef<number | null>(null);
  const submenuCloseTimer = useRef<number | null>(null);

  const cancelOpenTimer = () => {
    if (submenuOpenTimer.current) {
      window.clearTimeout(submenuOpenTimer.current);
      submenuOpenTimer.current = null;
    }
  };
  const cancelCloseTimer = () => {
    if (submenuCloseTimer.current) {
      window.clearTimeout(submenuCloseTimer.current);
      submenuCloseTimer.current = null;
    }
  };

  // Close on outside click / Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      cancelOpenTimer();
      cancelCloseTimer();
    };
  }, [onClose]);

  // Move keyboard focus into the menu when it opens.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const first = ref.current?.querySelector<HTMLElement>(
        ".tp-cm-item:not(.disabled)",
      );
      (first ?? ref.current)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const items = Array.from(
      ref.current.querySelectorAll<HTMLElement>(
        ":scope > .tp-cm-item:not(.disabled)",
      ),
    );
    if (items.length === 0) return;
    const activeIndex = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      const next =
        activeIndex < 0
          ? event.key === "ArrowDown"
            ? 0
            : items.length - 1
          : (activeIndex + delta + items.length) % items.length;
      items[next]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      const focused = document.activeElement as HTMLElement | null;
      if (
        focused?.classList.contains("tp-cm-item") &&
        !focused.classList.contains("disabled")
      ) {
        event.preventDefault();
        focused.click();
      }
    } else if (event.key === "ArrowRight" && activeIndex >= 0) {
      if (items[activeIndex].classList.contains("has-submenu")) {
        event.preventDefault();
        items[activeIndex].click();
      }
    }
  };

  // Reposition root menu so it fully fits inside the viewport
  useLayoutEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    // Use documentElement for more reliable app boundary detection in Tauri
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    let nx = x;
    let ny = y;
    // Ensure menu doesn't overflow right edge
    if (nx + rect.width + VIEWPORT_PAD > vw) {
      nx = Math.max(VIEWPORT_PAD, vw - rect.width - VIEWPORT_PAD);
    }
    // Ensure menu doesn't overflow bottom edge
    if (ny + rect.height + VIEWPORT_PAD > vh) {
      ny = Math.max(VIEWPORT_PAD, vh - rect.height - VIEWPORT_PAD);
    }
    // Ensure menu doesn't overflow left edge (in case x was very small)
    if (nx < VIEWPORT_PAD) nx = VIEWPORT_PAD;
    // Ensure menu doesn't overflow top edge
    if (ny < VIEWPORT_PAD) ny = VIEWPORT_PAD;
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny });
  }, [x, y, items, pos.x, pos.y]);

  const renderItem = (entry: ContextMenuEntry, idx: number) => {
    if ((entry as ContextMenuDivider).type === "divider") {
      return <div key={`d-${idx}`} className="tp-cm-divider" />;
    }
    if ((entry as ContextMenuSection).type === "section") {
      return (
        <div key={`s-${idx}`} className="tp-cm-section">
          {(entry as ContextMenuSection).label}
        </div>
      );
    }
    if ((entry as ContextMenuColorGrid).type === "color-grid") {
      const cg = entry as ContextMenuColorGrid;
      return (
        <div key={`c-${idx}`} className="tp-cm-color-grid">
          {cg.colors.map((c) => (
            <button
              key={c}
              className={`tp-cm-color-dot ${cg.active === c ? "active" : ""}`}
              style={{ background: c }}
              onClick={() => {
                cg.onPick(c);
                onClose();
              }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      );
    }

    const it = entry as ContextMenuItem;
    const hasSubmenu = !!it.submenu && it.submenu.length > 0;
    const isSubmenuOpen = openSubmenuIdx === idx;

    return (
      <SubmenuItem
        key={`i-${idx}`}
        item={it}
        hasSubmenu={hasSubmenu}
        isOpen={isSubmenuOpen}
        onClose={onClose}
        onMouseEnterItem={() => {
          cancelCloseTimer();
          if (hasSubmenu) {
            cancelOpenTimer();
            const delay = openSubmenuIdx !== null ? 0 : 120;
            submenuOpenTimer.current = window.setTimeout(() => {
              setOpenSubmenuIdx(idx);
            }, delay);
          } else {
            cancelOpenTimer();
            if (openSubmenuIdx !== null) {
              submenuCloseTimer.current = window.setTimeout(() => {
                setOpenSubmenuIdx(null);
              }, 250);
            }
          }
        }}
        onMouseLeaveItem={() => {
          cancelOpenTimer();
        }}
        onClickItem={(e) => {
          if (it.disabled) return;
          if (hasSubmenu) {
            e.stopPropagation();
            setOpenSubmenuIdx(isSubmenuOpen ? null : idx);
            return;
          }
          it.onClick?.();
          onClose();
        }}
        onSubmenuMouseEnter={() => cancelCloseTimer()}
        onSubmenuMouseLeave={() => {
          submenuCloseTimer.current = window.setTimeout(() => {
            setOpenSubmenuIdx((cur) => (cur === idx ? null : cur));
          }, 200);
        }}
      />
    );
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      aria-label="Menu"
      className="tp-context-menu"
      style={{
        position: "fixed",
        top: pos.y,
        left: pos.x,
        zIndex: "var(--tp-z-popover)",
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      {items.map((entry, idx) => renderItem(entry, idx))}
    </div>
  );
}

// Internal: a single item that may render a submenu, with viewport-aware positioning
function SubmenuItem({
  item,
  hasSubmenu,
  isOpen,
  onClose,
  onMouseEnterItem,
  onMouseLeaveItem,
  onClickItem,
  onSubmenuMouseEnter,
  onSubmenuMouseLeave,
}: {
  item: ContextMenuItem;
  hasSubmenu: boolean;
  isOpen: boolean;
  onClose: () => void;
  onMouseEnterItem: () => void;
  onMouseLeaveItem: () => void;
  onClickItem: (e: React.MouseEvent) => void;
  onSubmenuMouseEnter: () => void;
  onSubmenuMouseLeave: () => void;
}) {
  const itemRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  // side and verticalShift are computed AFTER the submenu renders so we
  // know its actual size; null = first paint, default to right.
  const [submenuStyle, setSubmenuStyle] = useState<React.CSSProperties>({
    position: "fixed",
    visibility: "hidden",
    zIndex: 1001,
  });

  useLayoutEffect(() => {
    if (!isOpen || !itemRef.current || !submenuRef.current) return;
    const itemRect = itemRef.current.getBoundingClientRect();
    const subRect = submenuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const gap = 4;
    // Default: show to the right of the menu item
    let left = itemRect.right + gap;
    let top = itemRect.top - 6;

    // Flip to left if not enough room on right
    if (left + subRect.width > vw - VIEWPORT_PAD) {
      left = itemRect.left - subRect.width - gap;
    }

    // Ensure within viewport horizontally
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
    if (left + subRect.width > vw - VIEWPORT_PAD) {
      left = Math.max(VIEWPORT_PAD, vw - subRect.width - VIEWPORT_PAD);
    }

    // Adjust vertical if overflowing
    if (top + subRect.height > vh - VIEWPORT_PAD) {
      top = Math.max(VIEWPORT_PAD, vh - subRect.height - VIEWPORT_PAD);
    }
    if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;

    setSubmenuStyle({
      position: "fixed",
      top,
      left,
      visibility: "visible",
      zIndex: 1001,
    });
  }, [isOpen]);

  // Reset visibility while closed so next open re-measures
  useEffect(() => {
    if (!isOpen) {
      setSubmenuStyle({ position: "fixed", visibility: "hidden", zIndex: 1001 });
    }
  }, [isOpen]);

  return (
    <div
      ref={itemRef}
      role="menuitem"
      tabIndex={item.disabled ? -1 : 0}
      aria-disabled={item.disabled || undefined}
      aria-haspopup={hasSubmenu || undefined}
      className={`tp-cm-item ${item.danger ? "danger" : ""} ${item.active ? "active" : ""} ${item.disabled ? "disabled" : ""} ${hasSubmenu ? "has-submenu" : ""}`}
      onMouseEnter={onMouseEnterItem}
      onMouseLeave={onMouseLeaveItem}
      onClick={onClickItem}
    >
      {item.icon && <span className="tp-cm-icon">{item.icon}</span>}
      <span className="tp-cm-label">{item.label}</span>
      {item.shortcut && <span className="tp-cm-kbd">{item.shortcut}</span>}
      {hasSubmenu && <span className="tp-cm-arrow" />}

      {hasSubmenu && isOpen && (
        <div
          ref={submenuRef}
          role="menu"
          className="tp-context-menu tp-cm-submenu-pop"
          style={{ ...submenuStyle, zIndex: "var(--tp-z-dialog)" }}
          onMouseEnter={onSubmenuMouseEnter}
          onMouseLeave={onSubmenuMouseLeave}
        >
          {item.submenu!.map((sub, sIdx) => renderSubItem(sub, sIdx, onClose))}
        </div>
      )}
    </div>
  );
}

function renderSubItem(entry: ContextMenuEntry, idx: number, onClose: () => void) {
  if ((entry as ContextMenuDivider).type === "divider") {
    return <div key={`sd-${idx}`} className="tp-cm-divider" />;
  }
  if ((entry as ContextMenuSection).type === "section") {
    return (
      <div key={`ss-${idx}`} className="tp-cm-section">
        {(entry as ContextMenuSection).label}
      </div>
    );
  }
  const it = entry as ContextMenuItem;
  return (
    <div
      key={`si-${idx}`}
      role="menuitem"
      tabIndex={it.disabled ? -1 : 0}
      aria-disabled={it.disabled || undefined}
      className={`tp-cm-item ${it.danger ? "danger" : ""} ${it.active ? "active" : ""} ${it.disabled ? "disabled" : ""}`}
      onClick={(e) => {
        if (it.disabled) return;
        e.stopPropagation();
        it.onClick?.();
        onClose();
      }}
    >
      {it.icon && <span className="tp-cm-icon">{it.icon}</span>}
      <span className="tp-cm-label">{it.label}</span>
      {it.shortcut && <span className="tp-cm-kbd">{it.shortcut}</span>}
    </div>
  );
}

// Hook for managing context menu state
export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null);
  const open = (e: React.MouseEvent, items: ContextMenuEntry[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX + 6, y: e.clientY + 6, items });
  };
  const close = () => setMenu(null);
  return { menu, open, close };
}
