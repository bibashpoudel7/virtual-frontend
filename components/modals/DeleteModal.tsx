import React from 'react';
import { Icon } from '@iconify/react';

interface DeleteModalProps {
  open: boolean;
  isLoading?: boolean;
  title?: string;
  message?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteModal({
  open,
  isLoading = false,
  title = "Delete Item",
  message = "Are you sure you want to delete this item? This action cannot be undone.",
  onConfirm,
  onCancel
}: DeleteModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        </div>
        
        {/* Body */}
        <div className="px-6 py-4">
          <div className="flex items-center justify-center mb-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
              <Icon icon="material-symbols:warning" className="w-8 h-8 text-red-600" />
            </div>
          </div>
          <p className="text-center text-gray-600">{message}</p>
        </div>
        
        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading}
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
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