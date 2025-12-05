"use client";

import { useEffect, useState } from "react";

interface AIAnalysis {
  verdict: string;
  confidence: number;
  reasoning: string;
  estimatedFairPrice?: string;
  priceCategory: string;
}

export default function ResultBox({ resultData }: { resultData: any }) {
  const aiAnalysis: AIAnalysis | null = resultData.aiAnalysis || null;

  // -------------------------------
  // 🔥 SANITY WARNING (felaktiga priser)
  // -------------------------------
  const sanityWarning: string | null = resultData.sanityWarning || null;

  // -------------------------------
  // 🔥 BLUFFREA WARNING
  // -------------------------------
  let bluffWarning: string | null = null;
  const previousPrice = resultData.previousPrice;

  const aiMax = aiAnalysis?.estimatedFairPrice
    ? parseInt(aiAnalysis.estimatedFairPrice.replace(/[^\d]/g, ""), 10)
    : null;

  if (previousPrice && aiMax && previousPrice > aiMax * 1.25) {
    bluffWarning =
      "⚠️ Möjlig bluff-rea: Tidigare pris är mer än 25% över marknadsvärdet enligt AI.";
  }

  // -------------------------------
  // FÄRG FÖR AI-BOXEN
  // -------------------------------
  const verdictColors: Record<string, string> = {
    kap: "#0d8f4d",
    rimligt: "#0d6efd",
    överpris: "#b02a37",
    oklart: "#6c757d",
  };

  const bg =
    verdictColors[aiAnalysis?.verdict?.toLowerCase() ?? "oklart"] || "#1e293b";

  return (
    <div style={{ marginTop: "20px" }}>
      {/* -------------------------------- */}
      {/* 🔥 RÖD SANITY WARNING */}
      {/* -------------------------------- */}
      {sanityWarning && (
        <div className="bg-red-900 border border-red-500 text-red-300 p-3 rounded-md mb-4 flex gap-2 font-bold text-lg">
          <span>⚠️</span> {sanityWarning}
        </div>
      )}

      {/* -------------------------------- */}
      {/* 🤖 AI ANALYS */}
      {/* -------------------------------- */}
      {aiAnalysis && (
        <div
          style={{
            marginBottom: "16px",
            padding: "20px",
            borderRadius: "12px",
            background: bg,
            color: "#fff",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <span style={{ fontSize: "24px" }}>🤖</span>
            <h2 style={{ fontSize: "22px", margin: 0 }}>Prixy-bedömning</h2>
          </div>

          {/* 🔷 GUL BLUFFREA-VARNING */}
          {bluffWarning && (
            <div className="bg-yellow-200 text-yellow-800 p-3 rounded-md mb-3 font-bold flex gap-2">
              <span>⚠️</span> {bluffWarning}
            </div>
          )}

          <strong>Verktyg:</strong> {aiAnalysis.verdict}
          <br />
          <strong>Säkerhet:</strong> {Math.round(aiAnalysis.confidence * 100)}%
          <br />
          <strong>Priskategori:</strong> {aiAnalysis.priceCategory}
          <br />
          {aiAnalysis.estimatedFairPrice && (
            <>
              <strong>Uppskattat rimligt pris:</strong>{" "}
              {aiAnalysis.estimatedFairPrice}
              <br />
            </>
          )}

          <p
            style={{
              marginTop: "12px",
              background: "rgba(0,0,0,0.1)",
              padding: "12px",
              borderRadius: "6px",
            }}
          >
            {aiAnalysis.reasoning}
          </p>
        </div>
      )}

      {/* -------------------------------- */}
      {/* 🛍️ Produktinfo */}
      {/* -------------------------------- */}
      <div
        style={{
          padding: "16px",
          borderRadius: "8px",
          background: "#f8f9fa",
          border: "1px solid #e9ecef",
        }}
      >
        {resultData.imageUrl && (
          <img
            src={resultData.imageUrl}
            alt={resultData.title}
            style={{
              maxWidth: "200px",
              maxHeight: "200px",
              marginBottom: "12px",
              borderRadius: "6px",
              objectFit: "contain",
            }}
          />
        )}

        <h3 style={{ fontSize: "18px" }}>{resultData.title}</h3>

        <p>
          <strong>Pris:</strong>{" "}
          {resultData.currentPrice
            ? `${resultData.currentPrice} kr`
            : "Okänt"}
        </p>
      </div>
    </div>
  );
}
