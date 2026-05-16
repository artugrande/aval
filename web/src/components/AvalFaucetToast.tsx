"use client";

import {useEffect, useState} from "react";

import {useAvalAutoFaucet} from "@/hooks/useAvalAutoFaucet";

/**
 * Mounts the auto-faucet hook globally (via the Header) and renders a
 * dismissable bottom-right toast when AVL is sent. Only renders when there's
 * actually something to say — silent on skip/error so visitors don't see noise.
 */
export function AvalFaucetToast() {
    const result = useAvalAutoFaucet();
    const [hidden, setHidden] = useState(false);

    // Auto-dismiss after a few seconds when we sent something
    useEffect(() => {
        if (result?.status !== "sent") return;
        setHidden(false);
        const t = setTimeout(() => setHidden(true), 8_000);
        return () => clearTimeout(t);
    }, [result?.status, result?.txHash]);

    if (!result || result.status !== "sent" || hidden) return null;

    return (
        <div className="aval-faucet-toast" role="status" aria-live="polite">
            <div className="aval-faucet-toast-icon" aria-hidden>
                💧
            </div>
            <div className="aval-faucet-toast-body">
                <div className="aval-faucet-toast-title">Recibiste {result.amount ?? "0.02"} AVL para gas</div>
                <div className="aval-faucet-toast-sub">
                    Listo para firmar transacciones en Aval L1.
                </div>
            </div>
            <button
                type="button"
                onClick={() => setHidden(true)}
                className="aval-faucet-toast-close"
                aria-label="Cerrar"
            >
                ×
            </button>
        </div>
    );
}
