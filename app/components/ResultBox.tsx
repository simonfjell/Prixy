"use client";

import { useEffect, useState } from "react";

type Verdict = "underprice" | "fair" | "overprice" | "kap" | "rimligt" | "överpris" | "oklart" | string;

interface AIAnalysis {
  verdict: "kap" | "rimligt" | "överpris" | "oklart";
  confidence: number;
  reasoning: string;
  estimatedFairPrice?: string;
  priceCategory: "mycket_billigt" | "billigt" | "normalt" | "dyrt" | "mycket_dyrt";
}

interface ScrapedResult {
  sourceUrl: string;
  pageTitle?: string;
  priceRaw?: string;
  priceValue?: number;
  description?: string;
  aiAnalysis?: AIAnalysis | null;
}

interface AuctioneerResult {
  title: string;
  currentPrice: number;
  estimatedValue: number;
  verdict: Verdict;
  confidence?: number;
  imageUrl?: string;
  aiAnalysis?: AIAnalysis | null;
  scrapedData?: ScrapedResult;
}

export default function ResultBox() {
  const [resultData, setResultData] = useState<AuctioneerResult | null>(null);

  useEffect(() => {
    function handleResult(event: Event) {
      const customEvent = event as CustomEvent<AuctioneerResult>;
      setResultData(customEvent.detail);
    }

    window.addEventListener("auctioneer-result", handleResult as EventListener);

    return () => {
      window.removeEventListener(
        "auctioneer-result",
        handleResult as EventListener
      );
    };
  }, []);

  if (!resultData) {
    return null; // Don't show anything until there's a result
  }

  // Handle both old format and new scraped format
  const aiAnalysis = resultData.aiAnalysis;

  const colors: Record<string, string> = {
    underprice: "#16a34a",
    fair: "#eab308", 
    overprice: "#dc2626",
    kap: "#16a34a",
    rimligt: "#eab308",
    överpris: "#dc2626",
    oklart: "#6b7280"
  };

  const bg = colors[resultData.verdict] ?? (aiAnalysis?.verdict ? colors[aiAnalysis.verdict] : "#374151");

  return (
    <div style={{ marginTop: "20px" }}>
      {/* AI Analysis Section - Show if available */}
      {aiAnalysis && (
        <div
          style={{
            marginBottom: "16px",
            padding: "20px",
            borderRadius: "12px",
            background: bg,
            color: "#fff",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
            <span style={{ fontSize: "24px" }}>🤖</span>
            <h2 style={{ fontSize: "22px", margin: 0 }}>Claude AI Analys</h2>
          </div>
          
          <div style={{ display: "grid", gap: "12px" }}>
            <div>
              <strong>Verdict:</strong> <span style={{ 
                fontSize: "18px", 
                textTransform: "uppercase",
                fontWeight: "bold"
              }}>{aiAnalysis.verdict}</span>
            </div>
            
            <div>
              <strong>Säkerhet:</strong> {Math.round(aiAnalysis.confidence * 100)}%
              <div style={{
                width: "100%",
                height: "6px",
                backgroundColor: "rgba(255,255,255,0.3)",
                borderRadius: "3px",
                marginTop: "4px"
              }}>
                <div style={{
                  width: `${aiAnalysis.confidence * 100}%`,
                  height: "100%",
                  backgroundColor: "white",
                  borderRadius: "3px"
                }}></div>
              </div>
            </div>
            
            <div>
              <strong>Priskategori:</strong> {aiAnalysis.priceCategory.replace('_', ' ')}
            </div>
            
            {aiAnalysis.estimatedFairPrice && (
              <div>
                <strong>Uppskattat rimligt pris:</strong> {aiAnalysis.estimatedFairPrice}
              </div>
            )}
            
            <div>
              <strong>Förklaring:</strong>
              <p style={{ 
                marginTop: "8px", 
                backgroundColor: "rgba(255,255,255,0.1)",
                padding: "12px",
                borderRadius: "6px",
                lineHeight: "1.5"
              }}>
                {aiAnalysis.reasoning}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Product Info Section */}
      <div
        style={{
          padding: "16px",
          borderRadius: "8px",
          background: "#f8f9fa",
          border: "1px solid #e9ecef",
        }}
      >
        {resultData.imageUrl && (
          <div style={{ marginBottom: "12px" }}>
            <img 
              src={resultData.imageUrl} 
              alt={resultData.title}
              style={{
                maxWidth: "200px",
                maxHeight: "200px",
                borderRadius: "6px",
                objectFit: "contain",
              }}
            />
          </div>
        )}
        
        <h3 style={{ fontSize: "18px", marginBottom: "12px", color: "#333" }}>
          {resultData.title || "Produkt"}
        </h3>
        
        <div style={{ color: "#666" }}>
          <p>
            <strong>Pris:</strong> {resultData.currentPrice ? `${resultData.currentPrice} kr` : "Okänt"}
          </p>
          
          {resultData.estimatedValue && (
            <p>
              <strong>Uppskattat värde:</strong> {resultData.estimatedValue} kr
            </p>
          )}
          
          {!aiAnalysis && (
            <p>
              <strong>Bedömning:</strong> {resultData.verdict}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
