import React, { useEffect, useState } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
    message: string;
    type?: ToastType;
    isVisible: boolean;
    onClose: () => void;
    duration?: number;
}

const Toast: React.FC<ToastProps> = ({
    message,
    type = 'success',
    isVisible,
    onClose,
    duration = 3000
}) => {
    const [show, setShow] = useState(false);

    const onCloseRef = React.useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    useEffect(() => {
        if (isVisible) {
            setShow(true);
            const timer = setTimeout(() => {
                setShow(false);
                setTimeout(() => {
                    if (onCloseRef.current) onCloseRef.current();
                }, 300); // Wait for fade out animation
            }, duration);
            return () => clearTimeout(timer);
        } else {
            setShow(false);
        }
    }, [isVisible, duration]);

    if (!isVisible && !show) return null;

    const getIcon = () => {
        switch (type) {
            case 'success':
                return <CheckCircle className="w-5 h-5 text-green-500" />;
            case 'error':
                return <AlertCircle className="w-5 h-5 text-red-500" />;
            case 'info':
                return <Info className="w-5 h-5 text-blue-500" />;
        }
    };

    const getStyles = () => {
        switch (type) {
            case 'success':
                return 'border-green-500 bg-green-50 text-green-800';
            case 'error':
                return 'border-red-500 bg-red-50 text-red-800';
            case 'info':
                return 'border-blue-500 bg-blue-50 text-blue-800';
        }
    };

    return (
        <div
            className={`fixed top-4 right-4 z-[9999] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border transition-all duration-300 transform ${show ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0'
                } ${getStyles()}`}
        >
            {getIcon()}
            <span className="font-medium text-sm">{message}</span>
            <button
                onClick={() => setShow(false)}
                className="ml-2 hover:bg-black/5 rounded-full p-1 transition-colors"
            >
                <X className="w-4 h-4 opacity-60 hover:opacity-100" />
            </button>
        </div>
    );
};

export default Toast;
