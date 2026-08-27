import Link from "next/link";
import { ORGANISATION_DETAILS, detailsFor } from "../../organisation";
import type { PolicyContent } from "../types";
import { H3, LINK, NOTE, P, SUBSECTION, UL } from "../styles";

/** Entity name, address, supervisory authority etc., resolved for Dutch. */
const d = detailsFor("nl");

/**
 * Dutch translation of `en.tsx`. Machine-drafted, not yet checked by a native
 * legal translator, and the review banner says so on the page itself.
 *
 * Bracketed placeholders are deliberately left in English so `[` stays a
 * reliable grep for "counsel still has to fill this in" across every locale.
 * GDPR terminology follows the Dutch of the Regulation itself
 * (verwerkingsverantwoordelijke, gerechtvaardigde belangen, recht op inzage,
 * gegevensoverdraagbaarheid), not a literal rendering of the English.
 */
const nl: PolicyContent = {
  title: "Privacyverklaring",
  description:
    "Hoe Law for AI Safety persoonsgegevens verzamelt, gebruikt, deelt en bewaart die via lawforaisafety.org worden ingediend.",
  dateLabels: {
    lastUpdated: "Laatst bijgewerkt",
    effectiveFrom: "Van kracht vanaf",
  },
  tocHeading: "Op deze pagina",
  tocLabel: "Onderdelen",
  languageSwitcherLabel: "Kies een taal",

  reviewNotice: (
    <p className="text-base text-brand-black/70">
      Ontwerp, in afwachting van juridische toetsing. Items tussen vierkante
      haken (bijv.{" "}
      <code>{ORGANISATION_DETAILS.registeredAddress.placeholder}</code>)
      zijn plaatshouders die nog door een juridisch adviseur moeten worden
      ingevuld, net als de aantekeningen die met een lijn zijn afgezet.
      Rechtspersoon, jurisdictie en toezichthoudende autoriteit zijn voorlopig
      ingevuld, uitgaande van een Belgische vzw, en moeten worden bevestigd.
      Deze Nederlandse versie is een vertaling van de Engelse tekst en is niet
      nagekeken door een juridisch vertaler met Nederlands als moedertaal. Rond
      dit alles af voordat deze pagina wordt gepubliceerd of vanaf de site wordt
      gelinkt.
    </p>
  ),

  intro: (
    <>
      <p className={P}>
        Het {d.entityName}{" "}
        (&ldquo;Law for AI Safety&rdquo;, &ldquo;wij&rdquo;, &ldquo;ons&rdquo;,
        &ldquo;onze&rdquo;) hecht veel waarde aan de bescherming van uw privacy
        en gaat zorgvuldig om met uw persoonsgegevens (hierna &ldquo;uw
        gegevens&rdquo;).
      </p>
      <p className={P}>
        In deze privacyverklaring leggen wij uit welke gegevens wij via{" "}
        <Link href="/" className={LINK}>
          lawforaisafety.org
        </Link>{" "}
        verzamelen, waarom wij dat doen, met wie wij ze delen, hoe lang wij ze
        bewaren en welke rechten u heeft. De verklaring gaat over de twee dingen
        die u op deze site kunt doen: u aanmelden om met ons samen te werken en
        u inschrijven voor onze nieuwsbrief.
      </p>
      <p className={P}>
        Heeft u na het lezen van deze privacyverklaring nog vragen, neem dan
        gerust contact met ons op.
      </p>
    </>
  ),

  sections: {
    "who-we-are": {
      label: "Wie zijn wij?",
      body: (
        <>
          <p className={P}>
            Het {d.entityName}, {d.legalForm}, gevestigd in {d.jurisdiction} te{" "}
            {d.registeredAddress}, is verwerkingsverantwoordelijke voor de
            persoonsgegevens die in deze verklaring worden beschreven. Dat
            betekent dat wij het doel van en de middelen voor de verwerking
            bepalen. Heeft u vragen over deze verklaring of over de manier
            waarop wij met uw gegevens omgaan, neem dan contact op via{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <ul className={UL}>
            <li>Ondernemingsnummer: {d.enterpriseNumber}</li>
            <li>Rechtspersonenregister (RPR): {d.registerCourt}</li>
          </ul>
          <p className={NOTE}>
            [Counsel: supply the legal form, enterprise number, and court of
            the register. Article 2:20 of the Companies and Associations Code
            requires a legal person&apos;s name, legal form, registered office,
            enterprise number, and register with its competent court on the
            website, whichever non-profit form is chosen; Article III.74 of the
            Code of Economic Law requires the enterprise number on
            publications. Both are site-wide obligations, so a legal notice or
            the site footer would satisfy them equally, and this block could
            move there. &ldquo;NGO&rdquo; is a description, not a legal form:
            the candidates are a national non-profit (VZW/ASBL) or an
            international one (IVZW/AISBL).]
          </p>
          {/*
            No Data Protection Officer is named, and none needs to be. See the
            fuller note in en.tsx. If one is ever appointed, Article 37(7)
            requires their contact details to be published in this section, in
            this and every other locale.
          */}
        </>
      ),
    },

    "data-we-collect": {
      label: "Welke gegevens verzamelen wij?",
      body: (
        <>
          <p className={P}>
            Welke gegevens wij verwerken hangt af van de manier waarop u met ons
            in contact staat. Hieronder vindt u het volledige overzicht.
          </p>

          <div className={SUBSECTION}>
            <h3 className={H3}>
              Als u zich aanmeldt om met ons samen te werken
            </h3>
            <p className={P}>
              U bevestigt uw identiteit via een van drie routes. Afhankelijk van
              de gekozen route verzamelen wij verschillende gegevens:
            </p>
            <ul className={UL}>
              <li>
                Inloggen met LinkedIn: wij ontvangen uw naam, e-mailadres en
                profielfoto rechtstreeks van LinkedIn zodra u dit op hun site
                bevestigt. Wij zien uw wachtwoord nooit. Deze gegevens zijn door
                de aanbieder geverifieerd.
              </li>
              <li>
                Inloggen met Google: zoals hierboven, waarbij uw naam,
                e-mailadres en profielfoto rechtstreeks van Google komen.
              </li>
              <li>
                Alleen naam en e-mailadres, zonder identiteitsverificatie:
                gebruikt u LinkedIn noch Google, dan kunt u uw naam en
                e-mailadres rechtstreeks invullen. Deze gegevens zijn volledig
                zelf opgegeven en niet geverifieerd. Wij hebben geen bewijs dat
                ze juist zijn, en onze beoordelaars krijgen de instructie ze ook
                zo te behandelen.
              </li>
            </ul>
            <p className={P}>
              Naast de identiteitsverificatie verzamelt het aanmeldformulier:
            </p>
            <ul className={UL}>
              <li>Organisatie of kantoor (optioneel, zelf opgegeven)</li>
              <li>URL van uw LinkedIn-profiel (optioneel, zelf opgegeven)</li>
              <li>
                Een cv-bestand, uitsluitend PDF, maximaal 5 MB (optioneel)
              </li>
              <li>
                Een geschreven toelichting op uw rol en relevantie (optioneel)
              </li>
              <li>Algemene opmerkingen (optioneel)</li>
              <li>Of u zich ook wilt inschrijven voor onze nieuwsbrief</li>
            </ul>
            <p className={P}>
              U moet ten minste één van de volgende zaken aanleveren: een
              LinkedIn-URL, een cv of een toelichting. Zo hebben wij iets om uw
              professionele achtergrond aan te toetsen.
            </p>
          </div>

          <div className={SUBSECTION}>
            <h3 className={H3}>
              Als u zich alleen inschrijft voor onze nieuwsbrief
            </h3>
            <p className={P}>
              Alleen uw e-mailadres, plus de bevestigingsstatus en het tijdstip
              waarop u op de bevestigingslink van de dubbele opt-in klikte.
            </p>
          </div>

          <div className={SUBSECTION}>
            <h3 className={H3}>Technische gegevens en misbruikpreventie</h3>
            <ul className={UL}>
              <li>
                Uw IP-adres, dat tijdelijk wordt gebruikt om het aantal
                aanvragen te begrenzen en wordt doorgegeven aan Cloudflare
                Turnstile (zie hieronder) om te controleren dat u geen bot bent.
                Het wordt niet in onze database opgeslagen.
              </li>
              <li>
                Signalen die Cloudflare Turnstile verzamelt als onderdeel van de
                botcontrole, waarop het eigen privacybeleid van Cloudflare van
                toepassing is.
              </li>
            </ul>
          </div>
        </>
      ),
    },

    "cv-handling": {
      label: "Cv’s en aanmeldingsdocumenten",
      body: (
        <p className={P}>
          Als u een cv uploadt, wordt dit vóór opslag aan de serverzijde
          gecontroleerd en bewaard in afgeschermde objectopslag. Het is nooit
          openbaar toegankelijk. Beoordelaars bekijken het via een afgeschermde
          viewer in de browser en downloaden het niet. Uw cv wordt automatisch
          verwijderd zodra er een beslissing over uw aanmelding is genomen, of
          na 24 uur als u de identiteitsverificatie nooit heeft afgerond.
        </p>
      ),
    },

    "how-we-use-it": {
      label: "Waarom verzamelen wij uw gegevens?",
      body: (
        <>
          <p className={P}>
            Wij verwerken uw gegevens uitsluitend voor de hieronder genoemde
            doeleinden:
          </p>
          <ul className={UL}>
            <li>
              Om aanmeldingen om met ons samen te werken te beoordelen en
              daarover te beslissen
            </li>
            <li>
              Om u per e-mail te informeren over de uitkomst van uw aanmelding
            </li>
            <li>
              Om u toe te voegen aan onze verzendlijst en u onze nieuwsbrief te
              sturen, als u zich daarvoor heeft aangemeld
            </li>
            <li>
              Om dubbele of herhaalde aanmeldingen te herkennen en beoordelaars
              context te geven als u zich eerder heeft aangemeld
            </li>
            <li>
              Om de site te beschermen tegen spam en geautomatiseerd misbruik
            </li>
            <li>
              Om u bij goedkeuring van uw aanmelding uit te nodigen voor onze
              Slack-werkruimte
            </li>
          </ul>
          <p className={P}>
            Wij gebruiken uw gegevens niet voor geautomatiseerde besluitvorming
            of profilering. Elke aanmelding wordt door een mens gelezen en
            beoordeeld.
          </p>
        </>
      ),
    },

    "legal-basis": {
      label: "Onze rechtsgrondslag voor de verwerking",
      body: (
        <>
          {/*
            Assessing an application rests on legitimate interests, and only
            that. Article 6(1)(b) is not available: membership is a networking
            arrangement, not a contract. See the fuller note in en.tsx,
            including the two consequences for the rights section. The
            Article 6(1)(f) balancing test is drafted at
            legitimate-interests-assessment.md in the repository root.
          */}
          <ul className={UL}>
            <li>
              Toestemming: inschrijvingen voor de nieuwsbrief, los of via het
              vakje op het aanmeldformulier, voor losse inschrijvingen bevestigd
              via een dubbele opt-in. U kunt uw toestemming op elk moment
              intrekken door u uit te schrijven.
            </li>
            <li>
              Gerechtvaardigde belangen: het beoordelen van aanmeldingen van
              juristen die met ons willen samenwerken, en het tegengaan van
              frauduleuze of geautomatiseerde inzendingen, afgewogen tegen uw
              belangen en rechten.
            </li>
            <li>
              Wettelijke verplichtingen: voor zover wij wettelijk verplicht zijn
              gegevens te bewaren of te verstrekken.
            </li>
          </ul>
        </>
      ),
    },

    retention: {
      label: "Hoe lang bewaren wij uw gegevens?",
      body: (
        <>
          <p className={P}>
            Wij bewaren uw gegevens niet langer dan nodig is voor het doel
            waarvoor ze zijn verzameld. In de praktijk betekent dat:
          </p>
          <ul className={UL}>
            <li>
              Aanmelding begonnen maar nooit afgerond, dus
              identiteitsverificatie niet voltooid: automatisch verwijderd na 24
              uur, inclusief een eventueel geüpload cv.
            </li>
            <li>
              Aanmelding in afwachting van beoordeling: bewaard totdat een
              beoordelaar een beslissing neemt.
            </li>
            <li>
              Beslist, goedgekeurd of afgewezen: uw volledige
              aanmeldingsdossier (naam, e-mailadres, cv, profielfoto, alles wat
              u heeft ingediend) wordt onmiddellijk verwijderd zodra de
              beslissing is genomen en u bent geïnformeerd. Wij bewaren
              uitsluitend een onomkeerbare cryptografische hash van uw
              e-mailadres, samen met de uitkomst, zodat wij een herhaalde
              aanmelding kunnen herkennen. De hash kan niet worden herleid tot
              uw e-mailadres, maar geldt nog steeds als gegeven over u: vraagt u
              ons uw gegevens te wissen, dan verwijderen wij ook de hash. Alleen
              bij afwijzingen worden de interne notities van de beoordelaar
              naast de hash bewaard en samen daarmee verwijderd; beoordelaars
              krijgen de instructie daarin geen naam of andere identificerende
              gegevens op te nemen.
            </li>
            <li>
              Nieuwsbriefabonnees: uw e-mailadres wordt bewaard zolang u
              ingeschreven blijft. U kunt zich op elk moment uitschrijven via de
              link in elke nieuwsbrief.
            </li>
          </ul>
          {/*
            The retained email hash is treated as personal data, and an erasure
            request reaches it, so the policy promises deletion of the hash and
            of any reviewer notes kept beside it. See the fuller note in en.tsx
            for why hashing is pseudonymisation rather than anonymisation, and
            why Article 11 does not help here.
          */}
        </>
      ),
    },

    "who-we-share-with": {
      label: "Met wie delen wij uw gegevens?",
      body: (
        <>
          <p className={P}>
            Wij verkopen uw persoonsgegevens niet. Wij delen ze uitsluitend:
          </p>
          <ul className={UL}>
            <li>
              Binnen ons eigen team, met de beoordelaars en medewerkers die er
              voor hun werk toegang toe nodig hebben.
            </li>
            <li>
              Met verwerkers: dienstverleners die in onze opdracht handelen en
              contractueel verplicht zijn uw gegevens te beschermen. Deze staan
              hieronder vermeld.
            </li>
            <li>
              Met derden, indien wettelijk vereist of noodzakelijk om de door u
              gevraagde dienst te leveren.
            </li>
          </ul>
          <p className={P}>
            De soorten verwerkers die wij gebruiken, elk voor het genoemde doel:
          </p>
          <ul className={UL}>
            <li>
              Een aanbieder van botbescherming, om te controleren of inzendingen
              op onze formulieren niet geautomatiseerd zijn.
            </li>
            <li>
              Een e-mailaanbieder, om transactionele e-mails te versturen
              (uitkomst van uw aanmelding, bevestiging van de nieuwsbrief) en
              onze verzendlijst te beheren. U kunt zich op elk moment
              uitschrijven via de uitschrijflink in elke nieuwsbrief.
            </li>
            <li>
              Een aanbieder van teamcommunicatie, die de werkruimte host waarvoor
              u wordt uitgenodigd als uw aanmelding wordt goedgekeurd. Vóór de
              uitnodiging controleert een beoordelaar of u al lid bent.
            </li>
            <li>
              Een hostingaanbieder, die deze site draait, aanmeldingsgegevens in
              een beheerde database bewaart en geüploade cv&apos;s in
              afgeschermde objectopslag houdt.
            </li>
          </ul>
          <div className={NOTE}>
            <p>
              [Counsel: the list above is confirmed complete. The processing
              agreement that applies to each, as published on 27 August 2026:
            </p>
            <ul className="list-disc pl-5 flex flex-col gap-1 mt-2">
              <li>
                Cloudflare: Data Processing Addendum at
                cloudflare.com/cloudflare-customer-dpa, v6.4 of 3 April 2026,
                incorporated by reference into the Self-Serve Subscription
                Agreement. All eight Article 28(3) limbs present: 3.1(a)
                instructions, 3.1(d) confidentiality, 3.1(c) and Annex 2
                security, 4 sub-processors (30 days&apos; notice, right to
                object at 4.4), 3.1(g)-(h) data subject requests, 3.1(j)
                assistance with Articles 32 to 36, 3.1(i) deletion or return, 5
                audit.
              </li>
              <li>
                Netlify: Data Processing Agreement at
                netlify.com/pdf/netlify-dpa.pdf, last updated 9 June 2026,
                incorporated by reference into Netlify&apos;s terms. Its
                Article 28(3) content sits at sections 4.1 (documented
                instructions), 4.1(d) (confidentiality), 7 (security), 6
                (sub-processors, general authorisation with 30 days&apos;
                notice and a right to object), 5 (assistance with data subject
                requests), 9 (DPIA assistance), 12 (return and deletion), and 8
                (audit).
              </li>
              <li>
                Brevo: Annex 2 to the General Terms and Conditions, version of
                15 May 2024. All eight limbs present: 3.1(iii) instructions,
                3.1(iv)-(v) confidentiality and training, 5.1-5.2 and Schedule
                2 security, 6 sub-processors (10 business days&apos; notice,
                right to object), 4.2-4.4 data subject requests, 9 assistance
                with Articles 32 to 36 and 5.3 breach notice within 72 hours,
                8.1 destruction or anonymisation within 100 days of the end, 10
                audit. Two things to note: clause 3.2(vi) forbids us putting
                special-category data into Customer Data, and Schedule 1 puts
                Brevo&apos;s servers in the EU with US exposure via Cloudflare
                and Zendesk.
              </li>
              <li>
                Slack: slack.com/terms-of-service/data-processing. Not
                automatic. Slack asks an authorised person to execute it
                through a form, so accepting the Customer Terms of Service
                alone leaves no Article 28 agreement in place. It needs
                signing. An invited person does accept Slack&apos;s own user
                terms, but that governs their relationship with Slack and does
                not displace ours: members join as authorised users of our
                workspace, not as customers of Slack in their own right, so we
                remain controller of the workspace content and Slack remains
                our processor. The disclosure also happens before they agree to
                anything, at the point a reviewer puts their email into Slack
                to send the invitation.
              </li>
            </ul>
            <p className="mt-2">
              Confirm each meets Article 28(3) and file the version accepted.]
            </p>
          </div>

          <div className={SUBSECTION}>
            <h3 className={H3}>Inloggen met LinkedIn of Google</h3>
            <p className={P}>
              LinkedIn en Google staan niet in de lijst hierboven, omdat wij hun
              geen gegevens van u sturen. Kiest u voor een van die
              inlogopties, dan logt u in op hun site, niet op de onze: wij zien
              uw wachtwoord nooit en uw aanmelding wordt nooit naar hen
              verstuurd. Zij bevestigen uw naam, e-mailadres en profielfoto aan
              ons. Daarbij treden zij op als zelfstandig
              verwerkingsverantwoordelijke voor uw gegevens, onder hun eigen
              privacybeleid, en niet als verwerker die in onze opdracht handelt.
              Door in te loggen laat u hun wel weten dat u uw account hier heeft
              gebruikt.
            </p>
          </div>
        </>
      ),
    },

    "international-transfers": {
      label: "Internationale doorgifte van gegevens",
      body: (
        <>
          <p className={P}>
            Een aantal van onze verwerkers bevindt zich buiten de{" "}
            {d.dataProtectionArea}, en onze e-mailaanbieder maakt gebruik van
            subverwerkers die daarbuiten liggen. Elke doorgifte is gedekt door
            een wettelijke waarborg:
          </p>
          <ul className={UL}>
            <li>
              Onze aanbieders van botbescherming, hosting en teamcommunicatie
              zijn gecertificeerd onder het EU-US Data Privacy Framework, en
              vallen terug op de modelcontractbepalingen van de Europese
              Commissie als die certificering niet langer geldt.
            </li>
            <li>
              Onze e-mailaanbieder neemt de modelcontractbepalingen op in zijn
              verwerkersovereenkomst voor doorgifte aan subverwerkers buiten de{" "}
              {d.dataProtectionArea}. De eigen servers staan daarbinnen; de
              doorgifte komt voort uit een klein aantal van zijn leveranciers.
            </li>
          </ul>
          <p className={P}>
            LinkedIn en Google staan hier niet vermeld, omdat wij hun helemaal
            geen gegevens van u sturen.
          </p>
          {/*
            Transfer mechanisms verified 26 August 2026, and LinkedIn and
            Google are treated as separate controllers rather than processors.
            See the fuller note in en.tsx, including why the Brevo wording must
            not go back to claiming EU-only hosting.
          */}
        </>
      ),
    },

    cookies: {
      label: "Cookies",
      body: (
        <>
          <p className={P}>
            De openbare site plaatst geen analyse-, advertentie- of
            trackingcookies.
          </p>
          <ul className={UL}>
            <li>
              Cloudflare Turnstile kan eigen cookies plaatsen als onderdeel van
              de botcontrole, waarop het privacybeleid van Cloudflare van
              toepassing is.
            </li>
          </ul>
        </>
      ),
    },

    security: {
      label: "Hoe beschermen wij uw gegevens?",
      body: (
        <>
          <p className={P}>
            Wij nemen passende technische en organisatorische maatregelen om uw
            gegevens te beveiligen tegen verlies, diefstal en ongeoorloofde
            toegang:
          </p>
          <ul className={UL}>
            <li>Gegevens worden versleuteld verzonden (HTTPS/TLS).</li>
            <li>
              Geüploade cv&apos;s worden vóór opslag aan de serverzijde
              gecontroleerd (bestandssignatuur, maximale omvang) en door
              beoordelaars uitsluitend bekeken via een afgeschermde viewer in de
              browser, zonder te worden gedownload naar het apparaat van de
              beoordelaar.
            </li>
            <li>
              Toegang tot het interne systeem waarin aanmeldingen worden
              beoordeeld, is beperkt tot een specifieke lijst van geautoriseerde
              personen, die elk zijn ingelogd op een geverifieerde sessie.
            </li>
            <li>
              Geautomatiseerde inzendingen worden door botdetectie en
              snelheidsbegrenzing gefilterd voordat zij onze systemen bereiken.
            </li>
          </ul>
        </>
      ),
    },

    "your-rights": {
      label: "Wat zijn uw rechten?",
      body: (
        <>
          <p className={P}>
            Onder het toepasselijke recht heeft u de volgende rechten met
            betrekking tot uw gegevens:
          </p>
          <ul className={UL}>
            <li>
              Recht op inzage: u kunt opvragen welke gegevens wij van u
              verwerken.
            </li>
            <li>
              Recht op rectificatie: u kunt onjuiste of onvolledige gegevens
              laten corrigeren.
            </li>
            <li>
              Recht op gegevenswissing: u kunt ons verzoeken uw gegevens te
              verwijderen.
            </li>
            <li>
              Recht op beperking van de verwerking: u kunt ons vragen de
              verwerking van uw gegevens te beperken.
            </li>
            <li>
              Recht van bezwaar: u kunt bezwaar maken tegen verwerking waarvoor
              wij ons op gerechtvaardigde belangen baseren, de grondslag
              waarop wij aanmeldingen beoordelen.
            </li>
            <li>
              Recht op gegevensoverdraagbaarheid: waar wij ons op uw
              toestemming baseren, op dit moment de nieuwsbrief, kunt u vragen
              om een kopie van die gegevens in een gestructureerd, gangbaar en
              machineleesbaar formaat.
            </li>
            <li>
              Recht om toestemming in te trekken: waar wij ons op toestemming
              baseren, kunt u die op elk moment intrekken, zonder dat dit
              afbreuk doet aan de verwerking die al heeft plaatsgevonden.
            </li>
          </ul>
        </>
      ),
    },

    "exercising-rights": {
      label: "Hoe kunt u uw rechten uitoefenen?",
      body: (
        <>
          <p className={P}>
            U kunt deze rechten uitoefenen door contact met ons op te nemen via{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <p className={P}>
            Voordat wij een verzoek om inzage of verwijdering uitvoeren, moeten
            wij weten dat het verzoek echt van u komt, zodat wij de gegevens
            van iemand anders niet op verzoek van een onbekende verstrekken of
            wissen. Uw e-mailadres is het enige identificatiegegeven dat wij van
            u hebben, dus aantonen dat u over dat adres beschikt is voldoende:
            normaal gesproken betekent dat schrijven vanaf dat adres, of het
            bevestigen van een eenmalige code die wij ernaartoe sturen. Wij
            vragen u geen kopie van een paspoort of identiteitskaart voor een
            verzoek over gegevens die u ons per e-mail heeft gegeven.
          </p>
          <p className={P}>
            Wij reageren binnen één maand. Is een verzoek uitzonderlijk complex,
            dan kunnen wij daar maximaal twee maanden bij nemen; wij laten u dat
            binnen de eerste maand weten.
          </p>
          {/*
            No identity document is requested, deliberately: Articles 12(6)
            and 5(1)(c). The one-month response period is Article 12(3). See
            the fuller note in en.tsx before changing any of this.
          */}
        </>
      ),
    },

    complaints: {
      label: "Klachten",
      body: (
        <>
          <p className={P}>
            Bent u niet tevreden over de manier waarop wij met uw gegevens
            omgaan, laat het ons dan eerst weten. Wij lossen het liever
            rechtstreeks op. U heeft daarnaast het recht een klacht in te dienen
            bij {d.supervisoryAuthority}, en om juridische stappen te
            ondernemen als u meent dat uw rechten zijn geschonden.
          </p>
          <ul className={UL}>
            <li>Adres: {d.supervisoryAuthorityAddress}</li>
            <li>
              E-mail:{" "}
              <a
                href={`mailto:${d.supervisoryAuthorityEmail}`}
                className={LINK}
              >
                {d.supervisoryAuthorityEmail}
              </a>
            </li>
            <li>
              Website:{" "}
              <a
                href={`https://${d.supervisoryAuthorityWebsite}`}
                className={LINK}
              >
                {d.supervisoryAuthorityWebsite}
              </a>
            </li>
          </ul>
          {/*
            The Gegevensbeschermingsautoriteit is competent because the
            controller is established in Belgium (Article 55), not because of
            its legal form. Contact details verified 26 August 2026. See the
            fuller note in en.tsx.
          */}
        </>
      ),
    },

    children: {
      label: "Gegevens van kinderen",
      body: (
        <p className={P}>
          Deze site is bedoeld voor juristen en richt zich niet op kinderen. Wij
          verzamelen niet bewust gegevens van kinderen.
        </p>
      ),
    },

    changes: {
      label: "Wijzigingen in deze verklaring",
      body: (
        <p className={P}>
          Wij kunnen deze privacyverklaring van tijd tot tijd aanpassen.
          Wijzigingen worden op deze pagina gepubliceerd en zijn van kracht
          vanaf de publicatiedatum, die bovenaan staat vermeld als
          &ldquo;Laatst bijgewerkt&rdquo;.
        </p>
      ),
    },

    contact: {
      label: "Contact",
      body: (
        <>
          <p className={P}>
            Vragen over deze verklaring of over de manier waarop wij met uw
            gegevens omgaan:{" "}
            <a href={`mailto:${d.contactEmail}`} className={LINK}>
              {d.contactEmail}
            </a>
            .
          </p>
          <p className={NOTE}>
            [Registered postal address, if required for statutory notices.]
          </p>
        </>
      ),
    },
  },
};

export default nl;
