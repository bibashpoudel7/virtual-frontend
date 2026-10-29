import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';

interface DeleteModalProps {
  open: boolean;
  isLoading?: boolean;
  title?: string;
  message?: React.ReactNode;
  warningNotice?: React.ReactNode;
  requireConfirmation?: boolean;
  confirmationCheckboxLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteModal({
  open,
  isLoading = false,
  title = "Delete Item",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  warningNotice,
  requireConfirmation = false,
  confirmationCheckboxLabel = "I confirm I want to delete this item",
  onConfirm,
  onCancel
}: DeleteModalProps) {
  const [confirmed, setConfirmed] = useState(false);

  // Reset confirmation state when modal opens/closes
  useEffect(() => {
    if (open) {
      setConfirmed(!requireConfirmation);
    }
  }, [open, requireConfirmation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        
        {/* Body */}
        <div className="px-6 py-4 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${warningNotice ? 'bg-amber-100' : 'bg-red-100'}`}>
              <Icon
                icon={warningNotice ? "material-symbols:warning" : "material-symbols:delete-forever"}
                className={`w-8 h-8 ${warningNotice ? 'text-amber-600' : 'text-red-600'}`}
              />
            </div>
          </div>
          <div className="text-center text-gray-600 text-sm">
            {typeof message === 'string' ? <p>{message}</p> : message}
          </div>

          {warningNotice && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-300 rounded-lg text-left">
              {warningNotice}
            </div>
          )}

          {requireConfirmation && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <label className="flex items-start gap-2.5 text-xs text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 cursor-pointer"
                />
                <span className="font-medium text-gray-800">{confirmationCheckboxLabel}</span>
              </label>
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3 bg-gray-50">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer text-sm font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || (requireConfirmation && !confirmed)}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            {isLoading ? (
              <>
                <Icon icon="eos-icons:loading" className="w-4 h-4" />
                Deleting...
              </>
            ) : (
              <>
                <Icon icon="material-symbols:delete" className="w-4 h-4" />
                Delete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}