// frontend/src/api.ts

const API_URL = "http://localhost:3001";

export async function mintNFT(wallet: string, drop: string) {
    try {
        const res = await fetch(`${API_URL}/mint`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                wallet,
                drop,
            }),
        });

        if (!res.ok) {
            return {
                ok: false,
                error: `HTTP_ERROR_${res.status}`,
            };
        }

        const data = await res.json();

        return {
            ok: true,
            signature: data.signature || null,
            mint: data.mint || null,
        };

    } catch (err) {
        console.error("[API ERROR]", err);

        return {
            ok: false,
            error: "NETWORK_ERROR",
        };
    }
}
