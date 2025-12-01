export default async function mockAnalyze(url: string) {
  console.log("Analyserar URL:", url);

  // Här fejk-ar vi logiken – senare kan vi göra riktig prisjämförelse
  return {
    title: "EXEMPEL – Destroyer 2017 USDGC",
    currentPrice: 1100,
    estimatedValue: 800,
    verdict: "overprice",
    confidence: 0.82,
  };
}
