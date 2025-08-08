interface ProgressStep {
  id: number;
  label: string;
  isActive: boolean;
  isCompleted: boolean;
}

interface ProgressIndicatorProps {
  steps: ProgressStep[];
}

export default function ProgressIndicator({ steps }: ProgressIndicatorProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center">
            <div className="relative">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-medium
                  ${
                    step.isActive || step.isCompleted
                      ? "bg-primary"
                      : "bg-gray-200 text-gray-500"
                  }`}
              >
                {step.isCompleted ? (
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
              </div>
              <div
                className={`absolute -bottom-8 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-sm font-medium
                  ${
                    step.isActive || step.isCompleted
                      ? "text-primary"
                      : "text-gray-500"
                  }`}
              >
                {step.label}
              </div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`flex-grow h-1 mx-4 ${
                  steps[index + 1].isActive || steps[index + 1].isCompleted
                    ? "bg-primary"
                    : "bg-gray-200"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
