import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-sm p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Integritetspolicy</h1>
          
          <div className="prose max-w-none">
            <p className="text-gray-600 mb-6">
              <strong>Senast uppdaterad:</strong> {new Date().toLocaleDateString('sv-SE')}
            </p>
            
            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduktion</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Välkommen till Prixy (Traderasniper). Vi respekterar din integritet och är engagerade i att skydda dina personuppgifter. 
                Denna integritetspolicy förklarar hur vi samlar in, använder och skyddar din information när du använder vår tjänst.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information vi samlar in</h2>
              <div className="space-y-4 text-gray-700">
                <div>
                  <h3 className="text-lg font-medium mb-2">2.1 Information du tillhandahåller</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>URL:er till produkter som du vill analysera</li>
                    <li>Feedback och kommunikation med oss</li>
                  </ul>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">2.2 Automatiskt insamlad information</h3>
                  <ul className="list-disc pl-6 space-y-1">
                    <li>IP-adress och geografisk plats</li>
                    <li>Webbläsartyp och version</li>
                    <li>Enhetstyp och operativsystem</li>
                    <li>Sidor du besöker och tid på sidan</li>
                    <li>Referrerande webbsidor</li>
                  </ul>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. Cookies och spårningstekniker</h2>
              <div className="space-y-4 text-gray-700">
                <p>Vi använder cookies och liknande tekniker för att förbättra din upplevelse på vår webbplats:</p>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">3.1 Nödvändiga cookies</h3>
                  <p>Dessa cookies är nödvändiga för webbplatsens grundläggande funktionalitet och kan inte stängas av.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">3.2 Analytiska cookies</h3>
                  <p>Vi använder Google Analytics för att förstå hur besökare använder vår webbplats. Detta hjälper oss att förbättra tjänsten.</p>
                </div>
                
                <div>
                  <h3 className="text-lg font-medium mb-2">3.3 Reklamcookies</h3>
                  <p>Vi kan använda Google AdSense för att visa relevanta annonser. Dessa cookies hjälper till att personalisera annonser baserat på dina intressen.</p>
                </div>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Hur vi använder din information</h2>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Tillhandahålla och förbättra vår produktanalystjänst</li>
                <li>Analysera användningsmönster för att förbättra användarupplevelsen</li>
                <li>Visa relevanta annonser (om du har samtyckt)</li>
                <li>Kommunicera med dig om tjänsten</li>
                <li>Förebygga bedrägeri och säkerställa säkerhet</li>
                <li>Efterleva juridiska skyldigheter</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Delning av information</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Vi säljer, handlar eller hyr inte ut dina personuppgifter till tredje parter. Vi kan dela information i följande situationer:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li>Med Google (Analytics, AdSense) enligt deras integritetspolicyer</li>
                <li>När det krävs enligt lag eller för att svara på juridiska processer</li>
                <li>För att skydda våra rättigheter, egendom eller säkerhet</li>
                <li>Med ditt uttryckliga samtycke</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Dina rättigheter (GDPR)</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Om du befinner dig i EU har du följande rättigheter enligt GDPR:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-gray-700">
                <li><strong>Rätt till tillgång:</strong> Begära information om vilka personuppgifter vi behandlar</li>
                <li><strong>Rätt till rättelse:</strong> Korrigera felaktig eller ofullständig information</li>
                <li><strong>Rätt till radering:</strong> Begära att vi raderar dina personuppgifter</li>
                <li><strong>Rätt till begränsning:</strong> Begära att vi begränsar behandlingen av dina uppgifter</li>
                <li><strong>Rätt till dataportabilitet:</strong> Få dina uppgifter i ett strukturerat format</li>
                <li><strong>Rätt att invända:</strong> Invända mot behandling baserad på berättigat intresse</li>
                <li><strong>Rätt att återkalla samtycke:</strong> Återkalla ditt samtycke när som helst</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibent text-gray-900 mb-4">7. Datasäkerhet</h2>
              <p className="text-gray-700 leading-relaxed">
                Vi implementerar lämpliga tekniska och organisatoriska säkerhetsåtgärder för att skydda dina personuppgifter 
                mot obehörig åtkomst, ändring, röjande eller förstörelse. Detta inkluderar HTTPS-kryptering, 
                säker datalagring och begränsad åtkomst till personuppgifter.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Datalagring</h2>
              <p className="text-gray-700 leading-relaxed">
                Vi behåller dina personuppgifter endast så länge som det är nödvändigt för de ändamål som anges i denna policy 
                eller som krävs enligt lag. Analysdata behålls vanligtvis i 26 månader enligt Google Analytics standardinställningar.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. Tredje parts tjänster</h2>
              <div className="space-y-4 text-gray-700">
                <p>Vår webbplats kan integrera med följande tredje parts tjänster:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li><strong>Google Analytics:</strong> För webbplatsanalys</li>
                  <li><strong>Google AdSense:</strong> För annonsering</li>
                  <li><strong>Claude AI:</strong> För produktanalys</li>
                </ul>
                <p>Dessa tjänster har sina egna integritetspolicyer som du uppmanas att läsa.</p>
              </div>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Ändringar av denna policy</h2>
              <p className="text-gray-700 leading-relaxed">
                Vi kan uppdatera denna integritetspolicy från tid till annan. Vi kommer att meddela dig om väsentliga ändringar 
                genom att publicera den nya policyn på denna sida och uppdatera "Senast uppdaterad"-datumet.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Kontakta oss</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Om du har frågor om denna integritetspolicy eller vill utöva dina rättigheter, kontakta oss:
              </p>
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-gray-700">
                  <strong>E-post:</strong> privacy@prixy.se<br />
                  <strong>Adress:</strong> [Din adress]<br />
                  <strong>Telefon:</strong> [Ditt telefonnummer]
                </p>
              </div>
            </section>
          </div>
          
          <div className="mt-12 pt-8 border-t border-gray-200">
            <Link 
              href="/" 
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors duration-200"
            >
              ← Tillbaka till startsidan
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}