import { X } from 'lucide-react';

interface WellClarificationModalProps {
  options: string[];
  originalQuery: string;
  onSelect: (wellName: string) => void;
  onCancel: () => void;
}

export default function WellClarificationModal({
  options,
  originalQuery,
  onSelect,
  onCancel,
}: WellClarificationModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-midnight">Which well did you mean?</h3>
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4">
          <p className="text-sm text-gray-600 mb-4">
            I found multiple wells that match "{originalQuery}". Please select one:
          </p>

          <div className="space-y-2">
            {options.map((wellName) => (
              <button
                key={wellName}
                onClick={() => onSelect(wellName)}
                className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-mid-blue hover:bg-blue-50 transition-colors"
              >
                <span className="font-medium text-midnight">{wellName}</span>
              </button>
            ))}
          </div>

          <button
            onClick={onCancel}
            className="w-full mt-4 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Cancel and ask a different question
          </button>
        </div>
      </div>
    </div>
  );
}
