'use client';

interface PlayTourOverlayProps {
    title?: string;
    description?: string;
    isVisible: boolean;
    variant?: 'default' | 'compact';
}

export default function PlayTourOverlay({ title, description, isVisible, variant = 'default' }: PlayTourOverlayProps) {
    if (!isVisible || (!title && !description)) return null;

    const isCompact = variant === 'compact';

    return (
        <div className={`absolute left-8 z-40 pointer-events-none animate-in fade-in slide-in-from-bottom-4 duration-700 ${isCompact ? 'bottom-20 max-w-lg' : 'bottom-24 max-w-2xl'
            }`}>
            {title && (
                <h1
                    className={`font-bold text-white mb-2 leading-tight ${isCompact ? 'text-3xl' : 'text-5xl'
                        }`}
                    style={{
                        WebkitTextStroke: '1px rgba(0,0,0,0.5)',
                        paintOrder: 'stroke fill'
                    }}
                >
                    {title}
                </h1>
            )}
            {description && (
                <p
                    className={`text-white leading-relaxed font-semibold ${isCompact ? 'text-base' : 'text-lg'
                        }`}
                    style={{
                        WebkitTextStroke: '0.5px rgba(0,0,0,0.4)',
                        paintOrder: 'stroke fill'
                    }}
                >
                    {description}
                </p>
            )}
        </div>
    );
}
