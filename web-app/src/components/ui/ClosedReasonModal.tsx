import React, { useState } from 'react';
import Modal from './Modal';

export type ClosedReason = 'Approved' | 'Unresponsive' | 'Rejected';
export type RejectedType = 'Temporary' | 'Permanent';

interface ClosedReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: ClosedReason, rejectedType?: RejectedType) => void;
}

const closedReasonOptions: ClosedReason[] = ['Approved', 'Unresponsive', 'Rejected'];

export default function ClosedReasonModal({ isOpen, onClose, onSubmit }: ClosedReasonModalProps) {
  const [selectedReason, setSelectedReason] = useState<ClosedReason | ''>('');
  const [rejectedType, setRejectedType] = useState<RejectedType | ''>('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReason) {
      setError('Please select a reason for closing.');
      return;
    }
    if (selectedReason === 'Rejected' && !rejectedType) {
      setError('Please select a type of rejection.');
      return;
    }
    setError(null);
    onSubmit(selectedReason as ClosedReason, selectedReason === 'Rejected' ? rejectedType as RejectedType : undefined);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Select Closed Reason" size="sm">
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label htmlFor="closed-reason" className="block text-sm font-medium text-gray-700 mb-2">
            Why is this application being closed?
          </label>
          <select
            id="closed-reason"
            name="closed-reason"
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
            value={selectedReason}
            onChange={e => {
              setSelectedReason(e.target.value as ClosedReason);
              setRejectedType(''); // Reset rejected type if reason changes
            }}
          >
            <option value="">Select a reason...</option>
            {closedReasonOptions.map(reason => (
              <option key={reason} value={reason}>{reason}</option>
            ))}
          </select>
          {selectedReason === 'Rejected' && (
            <div className="mt-4">
              <label htmlFor="rejected-type" className="block text-sm font-medium text-gray-700 mb-2">
                Type of Rejection
              </label>
              <select
                id="rejected-type"
                name="rejected-type"
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                value={rejectedType}
                onChange={e => setRejectedType(e.target.value as RejectedType)}
              >
                <option value="">Select type...</option>
                <option value="Temporary">Temporary</option>
                <option value="Permanent">Permanent</option>
              </select>
            </div>
          )}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
        <div className="flex justify-end space-x-2">
          <button
            type="button"
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
          >
            Save Reason
          </button>
        </div>
      </form>
    </Modal>
  );
}
