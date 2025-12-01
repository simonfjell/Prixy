"use client";

import { useState } from "react";

export default function InputForm() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAnalyze() {
    if (!url.trim()) return;

    setLoading(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();
      
      // Convert scraped data to old format for compatibility, but also include raw data
      const resultData = {
        title: data.pageTitle || "Okänd produkt",
        currentPrice: data.priceValue || 0,
        estimatedValue: data.estimatedValue || 0,
        verdict: data.verdict || (data.aiAnalysis?.verdict ?? "oklart"),
        confidence: data.confidence || data.aiAnalysis?.confidence,
        imageUrl: data.imageUrl,
        aiAnalysis: data.aiAnalysis,
        scrapedData: data
      };

      // skicka resultat till ResultBox via ett custom-event
      window.dispatchEvent(
        new CustomEvent("auctioneer-result", { detail: resultData })
      );
    } catch (err) {
      console.error(err);
      alert("Något gick fel med analysen.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginBottom: "20px" }}>
      <div style={{
        background: "rgba(42, 52, 65, 0.35)",
        border: "1.5px solid rgba(0,188,212,0.13)",
        borderRadius: "16px",
        padding: "28px 18px 22px 18px",
        boxShadow: "0 2px 16px 0 rgba(0,188,212,0.07)",
        backdropFilter: "blur(12px)",
        transition: "box-shadow 0.2s"
      }}>
        <input
          type="text"
          placeholder="Klistra in produktlänk från Tradera, Power, XXL, Elgiganten..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            width: "100%",
            padding: "18px 22px",
            borderRadius: "10px",
            border: "1.5px solid #00bcd4",
            marginBottom: "18px",
            background: "#232d3d",
            color: "#fff",
            fontSize: "17px",
            fontWeight: 500,
            outline: "none",
            boxSizing: "border-box",
            boxShadow: "0 1px 6px 0 rgba(0,188,212,0.04)",
            letterSpacing: "0.01em",
            transition: "border 0.2s, box-shadow 0.2s"
          }}
        />
        <button
          onClick={handleAnalyze}
          disabled={loading}
          style={{
            width: "100%",
            maxWidth: "320px",
            padding: "14px 0",
            borderRadius: "10px",
            border: "none",
            background: loading ? "#0097a7" : "#00bcd4",
            color: loading ? "#e0f7fa" : "#1a2332",
            fontWeight: 700,
            cursor: loading ? "wait" : "pointer",
            fontSize: "17px",
            display: "block",
            margin: "0 auto",
            boxShadow: loading ? "0 0 0 0 transparent" : "0 2px 8px 0 #00bcd455",
            letterSpacing: "0.01em",
            transition: "background 0.2s, color 0.2s, box-shadow 0.2s"
          }}
        >
          {loading ? "Analyserar..." : "Jämför pris"}
        </button>
      </div>
    </div>
  );
}
