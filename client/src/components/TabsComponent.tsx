import { useState } from "react";
import { cn } from "@/lib/utils";

interface Tab {
  id: string;
  label: string;
}

interface TabsComponentProps {
  tabs: Tab[];
  defaultActiveTab?: string;
  className?: string;
  children: React.ReactNode;
  onTabChange?: (tabId: string) => void;
}

export default function TabsComponent({
  tabs,
  defaultActiveTab,
  className,
  children,
  onTabChange,
}: TabsComponentProps) {
  const [activeTab, setActiveTab] = useState(defaultActiveTab || tabs[0]?.id);

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId);
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  return (
    <div className={className}>
      <div className="border-b border-gray-200">
        <div className="flex -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={cn(
                "py-2 px-4 font-medium",
                activeTab === tab.id
                  ? "text-primary border-b-2 border-primary"
                  : "text-gray-500 hover:text-primary"
              )}
              onClick={() => handleTabClick(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return null;
          
          return React.cloneElement(child, {
            className: cn(
              child.props.className,
              child.props.id === activeTab ? "block" : "hidden"
            ),
          });
        })}
      </div>
    </div>
  );
}
