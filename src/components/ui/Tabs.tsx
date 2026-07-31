import clsx from "clsx";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-paper-200">
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={clsx(
              "relative whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition-colors",
              isActive ? "text-pine-700" : "text-paper-500 hover:text-paper-800"
            )}
          >
            {t.label}
            {typeof t.count === "number" && (
              <span
                className={clsx(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  isActive ? "bg-pine-100 text-pine-700" : "bg-paper-100 text-paper-500"
                )}
              >
                {t.count}
              </span>
            )}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-pine-600" />}
          </button>
        );
      })}
    </div>
  );
}
