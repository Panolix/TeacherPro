import { useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Database, File, Folder } from "lucide-react";
import { useTranslation } from "../../i18n/useTranslation";
import type { SubjectDbInfo } from "../../store";

export interface SubjectDbScope {
  subject: string | null;
  grade: string | null;
  topic: string | null;
  file: string | null;
}

export const EMPTY_SCOPE: SubjectDbScope = {
  subject: null,
  grade: null,
  topic: null,
  file: null,
};

interface Props {
  databases: SubjectDbInfo[];
  value: SubjectDbScope;
  onChange: (scope: SubjectDbScope) => void;
  /** "dropdown" (chat) or "inline" (lesson-draft dialog: fixed tree in the window). */
  variant?: "dropdown" | "inline";
}

interface MenuGeometry {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Shared knowledge-base scope picker (chat + lesson-draft dialog).
 *
 * The chevron is the single expand/collapse control (with its own hover); the
 * rest of the row is the select target with its own hover. `variant="inline"`
 * renders the tree directly in the layout (used by the lesson-draft dialog so
 * the extra window height is actually used by the tree); `variant="dropdown"`
 * renders a fixed-position menu so scroll containers can never clip it.
 */
export function SubjectDbPicker({ databases, value, onChange, variant = "dropdown" }: Props) {
  const { t } = useTranslation();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<MenuGeometry | null>(null);
  const [expandedSubjects, setExpandedSubjects] = useState<Record<string, boolean>>({});
  const [expandedGrades, setExpandedGrades] = useState<Record<string, boolean>>({});
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  const label = value.subject
    ? [value.subject, value.grade, value.topic, value.file].filter(Boolean).join(" > ")
    : `— ${t("subjectDb.noDbSelected")} —`;

  const close = () => {
    setOpen(false);
    setMenu(null);
  };

  const toggleMenu = () => {
    if (open) {
      close();
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const maxHeight = Math.max(140, Math.min(360, window.innerHeight - rect.bottom - 16));
      setMenu({
        left: Math.max(8, rect.left),
        top: rect.bottom + 4,
        width: Math.min(rect.width, window.innerWidth - 16),
        maxHeight,
      });
    }
    setOpen(true);
  };

  const select = (scope: SubjectDbScope) => {
    onChange(scope);
    if (variant === "dropdown") close();
  };

  const toggle = (
    setter: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    key: string,
    event: React.MouseEvent,
  ) => {
    event.stopPropagation();
    setter((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isActive = (scope: SubjectDbScope) =>
    value.subject === scope.subject &&
    value.grade === scope.grade &&
    value.topic === scope.topic &&
    value.file === scope.file;

  const Row = ({
    depth,
    icon,
    name,
    extra,
    active,
    expandable,
    expanded,
    onExpand,
    onSelect,
    title,
  }: {
    depth: number;
    icon: React.ReactNode;
    name: string;
    extra?: React.ReactNode;
    active: boolean;
    expandable?: boolean;
    expanded?: boolean;
    onExpand?: (event: React.MouseEvent) => void;
    onSelect: () => void;
    title?: string;
  }) => (
    <div className="flex items-center" style={{ paddingLeft: 4 + depth * 20 }}>
      <button
        type="button"
        onClick={onExpand}
        disabled={!expandable}
        tabIndex={expandable ? 0 : -1}
        className={`h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-md transition-colors ${
          expandable
            ? "text-[var(--tp-text-muted)] hover:bg-[var(--tp-bg-4)] hover:text-[var(--tp-text-primary)]"
            : "pointer-events-none opacity-0"
        }`}
      >
        {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
      </button>
      <button
        type="button"
        onClick={onSelect}
        title={title ?? name}
        className={`flex items-center gap-1.5 flex-1 min-w-0 text-left pl-0.5 pr-2 py-1.5 rounded-md transition-colors ${
          active
            ? "text-[var(--tp-accent)]"
            : "text-[var(--tp-text-primary)] hover:bg-[var(--tp-bg-4)]"
        }`}
      >
        <span className="shrink-0 text-[var(--tp-text-muted)]">{icon}</span>
        <span className={`truncate text-[12.5px] ${active ? "font-semibold" : "font-medium"}`}>{name}</span>
        {extra}
        {active && <Check className="w-3 h-3 shrink-0 ml-auto" />}
      </button>
    </div>
  );

  const tree = (
    <>
      <div className="border-b mb-1 pb-1" style={{ borderColor: "var(--tp-border-strong)" }}>
        <Row
          depth={0}
          icon={<Database className="w-3.5 h-3.5" />}
          name={t("subjectDb.noDbSelected")}
          active={isActive(EMPTY_SCOPE)}
          onSelect={() => select(EMPTY_SCOPE)}
        />
      </div>

      {databases.map((subject) => {
        const subjectExpanded = expandedSubjects[subject.subject] ?? false;
        const subjectFiles = subject.files.filter((f) => f.is_embedded);
        return (
          <div key={subject.subject}>
            <Row
              depth={0}
              icon={<Folder className="w-3.5 h-3.5 text-[var(--tp-accent)]" />}
              name={subject.subject}
              active={isActive({ subject: subject.subject, grade: null, topic: null, file: null })}
              expandable={subject.grades.length > 0 || subjectFiles.length > 0}
              expanded={subjectExpanded}
              onExpand={(e) => toggle(setExpandedSubjects, subject.subject, e)}
              onSelect={() => select({ subject: subject.subject, grade: null, topic: null, file: null })}
            />

            {subjectExpanded && (
              <>
                {subjectFiles.map((file) => (
                  <Row
                    key={`sf-${file.name}`}
                    depth={1}
                    icon={<File className="w-3.5 h-3.5" />}
                    name={file.name}
                    active={isActive({ subject: subject.subject, grade: null, topic: null, file: file.name })}
                    onSelect={() =>
                      select({ subject: subject.subject, grade: null, topic: null, file: file.name })
                    }
                  />
                ))}

                {subject.grades.map((grade) => {
                  const gradeKey = `${subject.subject}::${grade.name}`;
                  const gradeExpanded = expandedGrades[gradeKey] ?? false;
                  const gradeFiles = grade.files.filter((f) => f.is_embedded);
                  const topics = grade.topics.filter((topic) => topic.chunk_count > 0);
                  return (
                    <div key={gradeKey}>
                      <Row
                        depth={1}
                        icon={<Folder className="w-3.5 h-3.5" />}
                        name={grade.name}
                        active={isActive({
                          subject: subject.subject,
                          grade: grade.name,
                          topic: null,
                          file: null,
                        })}
                        expandable={topics.length > 0 || gradeFiles.length > 0}
                        expanded={gradeExpanded}
                        onExpand={(e) => toggle(setExpandedGrades, gradeKey, e)}
                        onSelect={() =>
                          select({ subject: subject.subject, grade: grade.name, topic: null, file: null })
                        }
                      />

                      {gradeExpanded && (
                        <>
                          {gradeFiles.map((file) => (
                            <Row
                              key={`gf-${file.name}`}
                              depth={2}
                              icon={<File className="w-3.5 h-3.5" />}
                              name={file.name}
                              active={isActive({
                                subject: subject.subject,
                                grade: grade.name,
                                topic: null,
                                file: file.name,
                              })}
                              onSelect={() =>
                                select({
                                  subject: subject.subject,
                                  grade: grade.name,
                                  topic: null,
                                  file: file.name,
                                })
                              }
                            />
                          ))}

                          {topics.map((topic) => {
                            const topicKey = `${subject.subject}::${grade.name}::${topic.name}`;
                            const topicExpanded = expandedTopics[topicKey] ?? false;
                            const topicFiles = topic.files.filter((f) => f.is_embedded);
                            return (
                              <div key={topicKey}>
                                <Row
                                  depth={2}
                                  icon={<Folder className="w-3.5 h-3.5" />}
                                  name={topic.name}
                                  extra={
                                    <span className="text-[11px] text-[var(--tp-text-muted)] shrink-0">
                                      ({topic.chunk_count})
                                    </span>
                                  }
                                  active={isActive({
                                    subject: subject.subject,
                                    grade: grade.name,
                                    topic: topic.name,
                                    file: null,
                                  })}
                                  expandable={topicFiles.length > 0}
                                  expanded={topicExpanded}
                                  onExpand={(e) => toggle(setExpandedTopics, topicKey, e)}
                                  onSelect={() =>
                                    select({
                                      subject: subject.subject,
                                      grade: grade.name,
                                      topic: topic.name,
                                      file: null,
                                    })
                                  }
                                />

                                {topicExpanded &&
                                  topicFiles.map((file) => (
                                    <Row
                                      key={`tf-${file.name}`}
                                      depth={3}
                                      icon={<File className="w-3.5 h-3.5" />}
                                      name={file.name}
                                      active={isActive({
                                        subject: subject.subject,
                                        grade: grade.name,
                                        topic: topic.name,
                                        file: file.name,
                                      })}
                                      onSelect={() =>
                                        select({
                                          subject: subject.subject,
                                          grade: grade.name,
                                          topic: topic.name,
                                          file: file.name,
                                        })
                                      }
                                    />
                                  ))}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        );
      })}
    </>
  );

  if (variant === "inline") {
    return (
      <div
        className="rounded-md border overflow-y-auto p-1 [scrollbar-width:thin]"
        style={{
          borderColor: "var(--tp-border-strong)",
          background: "var(--tp-panel-muted)",
          maxHeight: 340,
        }}
      >
        {tree}
      </div>
    );
  }

  return (
    <div>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleMenu}
        className="flex items-center gap-1.5 w-full rounded-md px-2 py-1 text-[11px] text-left bg-[var(--tp-panel-muted)] text-[var(--tp-text-primary)] hover:bg-[var(--tp-bg-4)] transition-colors"
      >
        <Database className="w-3 h-3 shrink-0 text-[var(--tp-accent)]" />
        <span className="flex-1 truncate">{label}</span>
        <ChevronDown className="w-3 h-3 shrink-0 text-[var(--tp-text-muted)]" />
      </button>

      {open && menu && (
        <>
          <div className="fixed inset-0 z-[499]" onClick={close} />
          <div
            className="fixed z-[500] rounded-lg border shadow-2xl overflow-y-auto p-1 [scrollbar-width:thin]"
            style={{
              left: menu.left,
              top: menu.top,
              width: menu.width,
              maxHeight: menu.maxHeight,
              background: "var(--tp-panel-elevated)",
              borderColor: "var(--tp-border-strong)",
              color: "var(--tp-text-primary)",
            }}
          >
            {tree}
          </div>
        </>
      )}
    </div>
  );
}
