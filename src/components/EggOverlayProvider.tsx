import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { TactileButton } from './TactileButton';

export type EggOverlayState = 'loading' | 'success' | 'error' | null;

interface Messages {
  loading?: string;
  success?: string;
  error?: string;
}

interface EggOverlayContextType {
  runWithOverlay: <T>(action: () => Promise<T>, msgs?: Messages) => Promise<T | null>;
}

const EggOverlayContext = createContext<EggOverlayContextType | null>(null);

export function useEggOverlay() {
  const ctx = useContext(EggOverlayContext);
  if (!ctx) {
    throw new Error('useEggOverlay must be used within EggOverlayProvider');
  }
  return ctx;
}

export function EggOverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlayState, setOverlayState] = useState<EggOverlayState>(null);
  const [messages, setMessages] = useState<Messages>({});
  const [showCancelAfterTimeout, setShowCancelAfterTimeout] = useState(false);
  const [errorDetails, setErrorDetails] = useState<string>('');

  const retryRef = useRef<(() => Promise<void>) | null>(null);
  const cancelRef = useRef<(() => void) | null>(null);

  const runWithOverlay = useCallback(
    async function <T>(action: () => Promise<T>, msgs?: Messages): Promise<T | null> {
      setMessages(msgs || {});
      setShowCancelAfterTimeout(false);
      setErrorDetails('');

      let shown = false;
      let shownAt = 0;
      let cancelled = false;
      let phase: 'pending' | 'loading' | 'success' | 'error' | 'done' = 'pending';

      const showAfterMs = 300;
      const minShowMs = 600;
      const successMs = 1500;
      const timeoutMs = 15000;

      let cancelInFlight: (() => void) | null = null;
      const cancelPromise = new Promise<{ __cancelled: true }>((resolve) => {
        cancelInFlight = () => {
          cancelled = true;
          phase = 'done';
          clearTimeout(timer);
          clearTimeout(timeoutTimer);
          setOverlayState(null);
          setShowCancelAfterTimeout(false);
          resolve({ __cancelled: true });
        };
        cancelRef.current = cancelInFlight;
      });

      const timer = setTimeout(() => {
        if (cancelled || phase !== 'pending') return;
        shown = true;
        phase = 'loading';
        shownAt = Date.now();
        setOverlayState('loading');
      }, showAfterMs);

      const timeoutTimer = setTimeout(() => {
        if (!cancelled && shown && phase === 'loading') {
          setShowCancelAfterTimeout(true);
        }
      }, timeoutMs);

      try {
        const raceOutcome = await Promise.race([
          action().then((value) => ({ __cancelled: false as const, value })),
          cancelPromise,
        ]);

        clearTimeout(timer);
        clearTimeout(timeoutTimer);

        if (cancelled || raceOutcome.__cancelled) {
          cancelRef.current = null;
          return null;
        }

        if (shown) {
          const elapsed = Date.now() - shownAt;
          const left = minShowMs - elapsed;
          if (left > 0) {
            await new Promise((r) => setTimeout(r, left));
          }
          if (cancelled) {
            cancelRef.current = null;
            return null;
          }
          phase = 'success';
          setShowCancelAfterTimeout(false);
          setOverlayState('success');
          await new Promise((r) => setTimeout(r, successMs));
        }

        phase = 'done';
        cancelRef.current = null;
        setOverlayState(null);
        return raceOutcome.value;
      } catch (err) {
        clearTimeout(timer);
        clearTimeout(timeoutTimer);
        if (cancelled) {
          cancelRef.current = null;
          return null;
        }
        if (!shown) {
          shown = true;
          setOverlayState('loading');
        }
        phase = 'error';
        setShowCancelAfterTimeout(false);
        setErrorDetails((err as Error).message || 'Error desconocido');
        setOverlayState('error');

        const choice = await new Promise<boolean>((resolve) => {
          retryRef.current = async () => resolve(true);
          cancelRef.current = () => resolve(false);
        });

        retryRef.current = null;
        cancelRef.current = null;

        if (choice) {
          return runWithOverlay(action, msgs);
        }
        setOverlayState(null);
        return null;
      }
    },
    []
  );

  return (
    <EggOverlayContext.Provider value={{ runWithOverlay }}>
      {children}
      {overlayState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#090312]/80 select-none">
          <div className="w-[300px] rounded-[18px] bg-[#130824] border-t border-[#4C2889] border-x border-b border-[#2A134D] p-6 text-center text-[#F4EFFF]">
            {overlayState === 'loading' && (
              <>
                <div className="flex justify-center my-2">
                  <svg width="110" height="130" viewBox="0 0 120 150" className="animate-bounce">
                    <ellipse cx="60" cy="146" rx="34" ry="5" fill="#090312" opacity=".55" />
                    <path
                      d="M60 6C90 6 112 58 112 92C112 124 90 144 60 144C30 144 8 124 8 92C8 58 30 6 60 6Z"
                      fill="#fff"
                      stroke="#4C2889"
                      strokeWidth="4"
                    />
                    <path
                      d="M60 20Q75 60 60 120T60 20"
                      fill="#F6C928"
                    />
                  </svg>
                </div>
                <h2 className="mt-3 text-[19px] font-semibold text-[#F4EFFF]">
                  {messages.loading || 'Cargando'}
                </h2>
                {showCancelAfterTimeout && (
                  <div className="mt-3">
                    <button
                      onClick={() => cancelRef.current?.()}
                      className="px-4 py-2 text-xs font-semibold text-[#F4EFFF] bg-[#1F0E3B] rounded-lg border border-[#341961] hover:border-[#4C2889]"
                    >
                      Cancelar operación
                    </button>
                  </div>
                )}
              </>
            )}

            {overlayState === 'success' && (
              <>
                <div className="flex justify-center my-2">
                  <svg width="110" height="130" viewBox="0 0 120 150">
                    <ellipse cx="60" cy="146" rx="34" ry="5" fill="#090312" opacity=".55" />
                    <g>
                      <path
                        d="M60 6C90 6 112 58 112 92C112 124 90 144 60 144C30 144 8 124 8 92C8 58 30 6 60 6Z"
                        fill="#ECFDF5"
                        stroke="#10B981"
                        strokeWidth="4"
                      />
                      <circle cx="60" cy="108" r="24" fill="#10B981" />
                      <path
                        d="M48 108L57 117L74 97"
                        fill="none"
                        stroke="#fff"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </svg>
                </div>
                <h2 className="mt-3 text-[19px] font-semibold text-[#10B981]">
                  {messages.success || 'Se han sumado mis huevitos también'}
                </h2>
              </>
            )}

            {overlayState === 'error' && (
              <>
                <div className="flex justify-center my-2">
                  <svg width="110" height="130" viewBox="0 0 120 150">
                    <ellipse cx="60" cy="146" rx="34" ry="5" fill="#090312" opacity=".55" />
                    <path
                      d="M60 6C90 6 112 58 112 92C112 124 90 144 60 144C30 144 8 124 8 92C8 58 30 6 60 6Z"
                      fill="#fff"
                      stroke="#4C2889"
                      strokeWidth="4"
                    />
                    <path
                      d="M40 44L52 62L42 76L58 92L48 108L60 124"
                      fill="none"
                      stroke="#F43F5E"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="98" cy="118" r="17" fill="#F43F5E" />
                    <path d="M98 108V120" stroke="#fff" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="98" cy="127" r="2.4" fill="#fff" />
                  </svg>
                </div>
                <h2 className="mt-3 text-[19px] font-semibold text-[#F43F5E]">
                  {messages.error || 'Se están atorando mis huevos'}
                </h2>
                {errorDetails && (
                  <p className="mt-1.5 text-[11px] text-[#9E8FB2] line-clamp-2">{errorDetails}</p>
                )}
                <div className="mt-4 flex items-center justify-center gap-2">
                  <TactileButton
                    variant="primary"
                    size="sm"
                    onClick={() => retryRef.current?.()}
                  >
                    Reintentar
                  </TactileButton>
                  <TactileButton
                    variant="neutral"
                    size="sm"
                    onClick={() => cancelRef.current?.()}
                  >
                    Cancelar
                  </TactileButton>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </EggOverlayContext.Provider>
  );
}
