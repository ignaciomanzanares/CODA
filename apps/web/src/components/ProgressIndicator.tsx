interface ProgressStep {
  id: number;
  label: string;
  state: 'locked' | 'active' | 'done';
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
  onSelect?: (id: number) => void;
}

export default function ProgressIndicator({ steps, onSelect }: ProgressIndicatorProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center">
        {steps.map((step, index) => {
          const isEnabled = step.state !== 'locked';
          const isActiveOrDone = step.state === 'active' || step.state === 'done';
          return (
            <div key={step.id} className="flex items-center">
              <div className="relative">
                <button
                  type="button"
                  disabled={!isEnabled}
                  onClick={() => isEnabled && onSelect?.(step.id)}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors
                    ${isEnabled ? 'bg-primary hover:brightness-110' : 'bg-muted text-muted-foreground'}`}
                >
                  {step.state === 'done' ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    step.id
                  )}
                </button>
                <div
                  className={`absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-sm font-medium
                    ${isActiveOrDone ? 'text-primary' : 'text-muted-foreground'}`}
                >
                  {step.label}
                </div>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`flex-grow h-1 mx-4 ${
                    steps[index + 1].state !== 'locked' ? 'bg-primary' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
