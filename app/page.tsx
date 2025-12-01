"use client";

import { useState } from "react";

type AnalysisResult = {
  sourceUrl?: string;
  pageTitle?: string | null;
  ogTitle?: string | null;
  priceRaw?: string | null;
  priceValue?: number | null;
  priceConfidence?: number | null;
  description?: string | null;
  description_short?: string | null;
  comparable_median?: number | null;
  priceContext?: string | null;
  imageUrl?: string | null;
  error?: string;
  aiAnalysis?: {
    verdict?: string;
    confidence?: number;
    reasoning?: string;
    estimatedFairPrice?: string;
    priceCategory?: string;
  };
  altCandidates?: Array<{
    raw: string;
    value: number;
    context: string;
    score: number;
  }>;
  fakeSaleFlag?: boolean;
  fakeSaleWarning?: string;
  previousPrice?: number | null;
};
import Head from "next/head";

export default function Home() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  async function analyze() {
    if (!url.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await res.json()) as AnalysisResult;
      setResult(data);
    } catch (err) {
      console.error("Fel vid analys:", err);
      setResult({ error: "Något gick fel i frontend/anslutningen." });
    }
    setLoading(false);
  }

  return (
    <>
      <Head>
        <title>Prixy – AI-prisanalys, fake-rea och marknadsvärde på sekunder</title>
        <meta name="description" content="Prixy använder AI för att analysera priser, upptäcka fejkade reor och ge dig marknadsvärde på produkter från Tradera, Blocket, Power, Elgiganten, XXL m.fl. Spara pengar med objektiv prisbedömning." />
        <meta name="keywords" content="AI prisanalys, fake rea, marknadsvärde, Tradera, Blocket, Power, Elgiganten, XXL, Prisjakt, Pricerunner, produktvärdering, smart shopping, spara pengar, prisrobot, AI price analysis, real-time product valuation, fake sale detector, objektiv prisbedömning" />
        <meta property="og:title" content="Prixy – AI-prisanalys, fake-rea och marknadsvärde på sekunder" />
        <meta property="og:description" content="Prixy använder AI för att analysera priser, upptäcka fejkade reor och ge dig marknadsvärde på produkter från Tradera, Blocket, Power, Elgiganten, XXL m.fl. Spara pengar med objektiv prisbedömning." />
        <meta property="og:image" content="/PRIXY-LOGO.png" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://prixy.se/" />
      </Head>
      <main className="min-h-screen bg-[#0D1B2A] text-white">
        <div className="max-w-4xl mx-auto px-6 py-6 space-y-4">
        {/* HEADER */}
        <header className="space-y-2 text-center">
          <div className="flex flex-col items-center justify-center">
            <img 
              src="/PRIXY-LOGO.png" 
              alt="Prixy Logo" 
              className="h-32 w-auto"
            />
            <span className="text-[#3FE0B5] text-xs font-semibold mt-1 tracking-wide uppercase">Find the real price.</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#00D4FF] mb-1">Smart prisanalys på sekunder</h1>
          <p className="text-[#E9F1F7]/80 text-base font-medium max-w-2xl mx-auto mb-4">
            Prixy analyserar marknadsdata, historiska priser och produktvärde för att avgöra om ett pris är ett kap, rimligt, överpris eller fejkad rea.
          </p>
          {/* Accordion: Vad är Prixy? */}
          <div className="max-w-md mx-auto mt-4 mb-2">
            <button
              className="w-full flex justify-center items-center rounded-lg bg-[#1B263B]/80 border border-[#00D4FF]/20 shadow px-2 py-2 text-center text-[#E9F1F7]/80 font-medium text-sm focus:outline-none focus:ring-2 focus:ring-[#00D4FF] transition-all"
              onClick={() => setShowInfo((v) => !v)}
              aria-expanded={showInfo}
              aria-controls="prixy-info-panel"
            >
              <span className="w-full text-center">{showInfo ? '[-] Vad är Prixy?' : '[+] Vad är Prixy?'}</span>
            </button>
            {showInfo && (
              <div id="prixy-info-panel" className="bg-[#1B263B]/90 border-t border-[#00D4FF]/10 rounded-b-lg px-3 py-2 text-xs text-[#E9F1F7]/70 space-y-2 animate-fade-in">
                <ul className="space-y-0.5">
                  <li><span className="font-semibold text-green-300">Kap</span> – betydligt lägre än marknadsnivå</li>
                  <li><span className="font-semibold text-yellow-200">Rimligt</span> – nära normalpris</li>
                  <li><span className="font-semibold text-red-300">Överpris</span> – dyrare än likvärdiga</li>
                  <li><span className="font-semibold text-yellow-200">Fejkad rea</span> – tidigare pris verkar falskt</li>
                </ul>
                <hr className="border-[#00D4FF]/10 my-1" />
                <div>
                  <span className="font-medium">Så funkar det:</span>
                  <ol className="list-decimal list-inside mt-0.5 space-y-0">
                    <li>Klistra in en länk</li>
                    <li>Prixy läser av marknadsdata</li>
                    <li>Du får AI-bedömningen direkt</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
          {/* SEO-optimerande dold text för Google */}
          <p className="hidden">
            AI prisanalys, kap eller överpris, är detta rea fejk, värdering av produkter i realtid, AI-baserad prisbedömning, marknadsvärde, historiska priser, fake-rea-detektion, Tradera, Blocket, Power, Elgiganten, XXL, Prisjakt, Pricerunner, produktvärdering, smart shopping, spara pengar, prisrobot, AI price analysis, real-time product valuation, fake sale detector, objektiv prisbedömning.
          </p>
        </header>

        {/* INPUT */}
        <section className="bg-[#1B263B] backdrop-blur-sm rounded-xl p-4 space-y-3 shadow-xl shadow-black/20 border border-[#00D4FF]/20">
          <input
            type="text"
            placeholder="Klistra in produktlänk från Tradera, Power, XXL, Elgiganten..."
            className="w-full rounded-lg bg-[#0D1B2A] border-2 border-[#1B263B] px-4 py-2.5 text-sm text-[#E9F1F7] placeholder:text-[#E9F1F7]/40 focus:outline-none focus:ring-2 focus:ring-[#00D4FF] focus:border-[#00D4FF] transition-all shadow-inner"
            value={url}
            onChange={(e) => setUrl((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => e.key === 'Enter' && analyze()}
          />

          <button
            onClick={analyze}
            disabled={loading}
            className="w-full max-w-xs mx-auto block rounded-lg bg-gradient-to-r from-[#00D4FF] to-[#00B8D4] py-2 px-4 text-sm font-semibold text-[#0D1B2A] hover:shadow-lg hover:shadow-[#00D4FF]/30 hover:-translate-y-0.5 disabled:from-[#1B263B] disabled:to-[#1B263B] disabled:text-[#E9F1F7]/30 disabled:cursor-not-allowed transition-all shadow-md"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-[#00D4FF]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                </svg>
                Analyserar...
              </span>
            ) : (
              'Analysera'
            )}
          </button>
        </section>

        {/* RESULTATKORT */}
        {result && !loading && !result.error && (
          <section className="bg-[#1B263B] rounded-xl p-6 shadow-xl shadow-black/20 border border-[#00D4FF]/20 mt-6 animate-fade-in">
            <div className="grid md:grid-cols-2 gap-5">
              {/* Bild - Centrerad och polerad */}
              {result.imageUrl && (
                <div className="bg-[#0D1B2A]/60 rounded-xl p-4 flex items-center justify-center border border-[#00D4FF]/10 shadow-lg shadow-black/20">
                  <img 
                    src={result.imageUrl} 
                    alt={result.pageTitle || "Produktbild"}
                    className="max-w-full max-h-48 object-contain rounded-lg drop-shadow-2xl"
                  />
                </div>
              )}

              {/* Produktinfo */}
              <div className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-xl font-bold text-[#E9F1F7] leading-tight">
                    {result.pageTitle || result.ogTitle || "Produkt"}
                  </h2>
                  <a 
                    href={result.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-[#3FE0B5] hover:text-[#2EC4B6] font-medium inline-flex items-center gap-1 transition-colors"
                  >
                    🔗 Visa källa
                  </a>
                </div>

                {/* Prixy-bedömning highlightad */}
                {result.aiAnalysis && (
                  <div className="rounded-xl p-4 border-2 shadow-lg bg-[#1B263B]/70 border-[#00D4FF] mb-2">
                    <div className="flex items-center gap-3 mb-2">
                      <img src="/LOGO (P).png" alt="Prixy" className="h-6 w-6" />
                      <span className="text-lg font-bold text-[#00D4FF]">Prixy-bedömning</span>
                    </div>
                    {/* Fake rea-varning */}
                    {result.fakeSaleFlag && result.fakeSaleWarning && (
                      <div className="flex items-center gap-2 mb-2 p-2 rounded bg-yellow-900/60 border border-yellow-400">
                        <span className="text-2xl text-yellow-300">⚠️</span>
                        <span className="text-xs text-yellow-200 font-semibold">{result.fakeSaleWarning}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">
                        {result.aiAnalysis.verdict === "kap" && "🟢"}
                        {result.aiAnalysis.verdict === "rimligt" && "🟡"}
                        {result.aiAnalysis.verdict === "normalpris" && "⚪"}
                        {result.aiAnalysis.verdict === "överpris" && "🔴"}
                        {!result.aiAnalysis.verdict && "🤖"}
                      </span>
                      <div>
                        <p className="text-lg font-black text-[#E9F1F7] capitalize">{result.aiAnalysis.verdict || "Ingen bedömning"}</p>
                        {typeof result.aiAnalysis.confidence === 'number' && (
                          <p className="text-xs text-[#E9F1F7]/60 font-medium">Säkerhet: {Math.round(result.aiAnalysis.confidence * 100)}%</p>
                        )}
                      </div>
                    </div>
                    {result.aiAnalysis.priceCategory && (
                      <p className="text-xs text-[#E9F1F7]/60 font-medium">Priskategori: {result.aiAnalysis.priceCategory}</p>
                    )}
                    {result.aiAnalysis.estimatedFairPrice && (
                      <p className="text-xs text-[#E9F1F7]/60 font-medium">Uppskattat rimligt pris: {result.aiAnalysis.estimatedFairPrice}</p>
                    )}
                    {result.aiAnalysis.reasoning && (
                      <p className="text-xs text-[#E9F1F7]/80 leading-relaxed">{result.aiAnalysis.reasoning}</p>
                    )}
                  </div>
                )}

                {/* Pris med färgkodning */}
                <div
                  className={`rounded-xl p-4 border-2 transition-all duration-500 shadow-lg
                    ${result.aiAnalysis?.verdict === 'kap' ? 'bg-green-700/30 border-green-400' : ''}
                    ${result.aiAnalysis?.verdict === 'överpris' ? 'bg-red-700/30 border-red-400' : ''}
                    ${result.aiAnalysis?.verdict === 'rimligt' || result.aiAnalysis?.verdict === 'normalt' || !result.aiAnalysis?.verdict || result.aiAnalysis?.verdict === 'oklart' ? 'bg-[#1B263B]/60 border-[#E9F1F7]/20' : ''}
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-[#E9F1F7]/60 uppercase tracking-wider">Pris</p>
                  </div>
                  <p className="text-3xl font-black text-[#E9F1F7]">
                    {result.priceValue ? `${result.priceValue.toLocaleString('sv-SE')} kr` : result.priceRaw || "Ej tillgängligt"}
                  </p>
                  {typeof result.previousPrice === 'number' && result.previousPrice > 0 && (
                    <p className="text-xs text-yellow-300 font-bold mt-1">Tidigare pris: {result.previousPrice.toLocaleString('sv-SE')} kr</p>
                  )}
                  {result.priceContext && (
                    <p className="text-xs text-[#E9F1F7]/50 mt-2">{result.priceContext}</p>
                  )}
                </div>

                {/* Beskrivning */}
                {result.description && (
                  <div className="bg-[#0D1B2A]/40 rounded-lg p-3 border border-[#00D4FF]/10 shadow-md shadow-black/10">
                    <p className="text-xs font-bold text-[#00D4FF] mb-2 uppercase tracking-wide">Beskrivning</p>
                    <p className="text-xs text-[#E9F1F7]/80 whitespace-pre-wrap leading-relaxed max-h-24 overflow-y-auto">
                      {result.description}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {/* TRUST ELEMENTS - Footer */}
        <footer className="mt-8 pt-6 border-t border-[#00D4FF]/20">
          <div className="text-center space-y-2">
            <p className="text-xs text-[#E9F1F7]/50 leading-relaxed max-w-2xl mx-auto flex items-center justify-center gap-2">
              <img src="/LOGO (P).png" alt="Prixy" className="h-4 w-4" />
              <span className="font-semibold text-[#00D4FF]">Prixy</span> använder AI för att ge prisbedömningar baserat på marknadsvärden, produktdata och historiska försäljningar.
            </p>
            <p className="text-xs text-[#E9F1F7]/30">
              Stöd för Tradera, Power.se, XXL, Elgiganten, Blocket m.fl.
            </p>
          </div>
        </footer>
      </div>
    </main>
    </>
  );
}