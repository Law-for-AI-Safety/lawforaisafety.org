import Image from "next/image";
import Nav from "./Nav";
import WipeButton from "./WipeButton";

function Rule() {
  return (
    <svg viewBox="0 0 52 12" width="56" height="13" aria-hidden fill="none">
      <path d="M0 5 C14 2 38 8 52 5 C38 10 14 7 0 5Z" fill="#9b1c1f" />
    </svg>
  );
}

const team = [
  {
    name: "Raphaël Weuts",
    role: "Board Member",
    bio: "AI governance consultant. Author of On Accuracy of European AI Law. European representative in the Asia-Europe for AI Network AI Governance working group. Former visiting professor in AI at UC Leuven.",
    linkedin: "https://www.linkedin.com/in/raphaelweuts/"
  },
  {
    name: "Karolina Gruzel",
    role: "Board Member",
    bio: "Educational background in European Law. Field-builder, Moral Ambition for AI. AI Policy Strategy Fellow, Successif. AI Policy and Research Communicator.",
    linkedin: "https://www.linkedin.com/in/karolina-gruzel/"
  },
  {
    name: "Katie Stewart",
    role: "Board Member",
    bio: "Senior research manager and financial sector specialist. Former ops at the Future of Humanity Institute and research and project manager at RAND.",
    linkedin: "https://www.linkedin.com/in/katie-stewart-uk/"
  },
  {
    name: "Didier Coeurnelle",
    role: "Board Member",
    bio: "Lawyer. Co-chair of Healthy Life Extension Society. Board member for International Longevity Alliance. Advisor of Democracy Without Borders. Steering Committee member at the Global AI Governance Alliance.",
    linkedin: "https://www.linkedin.com/in/didiercoeurnelle/"
  },
  {
    name: "Raluca Spataru",
    role: "Practising Lawyer",
    bio: "President of the Romanian chapter of PauseAI.",
    linkedin: "https://www.linkedin.com/in/raluca-spataru-01a439302/"
  },
  {
    name: "Cristian Teodorescu",
    role: "Managing Director, Neo Teo",
    bio: "Educational background in Human Rights Law. Former senior expert for the Romanian Government.",
    linkedin: "https://www.linkedin.com/in/cryptoescu/"
  },
  {
    name: "Julia Moncmanova",
    role: "Creative Designer",
    bio: "Consulting creative designer at AppTweak.",
    linkedin: "https://www.linkedin.com/in/julia-moncmanova-22a314264/"
  },
];

const mechanisms = [
  {
    title: "Survey & Convene",
    body: "We survey and convene people working at the intersection of law and AI — through meetups, hackathons, and events — to identify promising opportunities for impact, barriers to litigation, and favourable jurisdictions. We organise research projects and fellowships to develop knowledge and experts in this area, and strategically communicate relevant research to increase the likelihood of it being put into practice.",
  },
  {
    title: "Transparency",
    body: "We promote greater transparency in AI governance through initiatives such as Freedom of Information requests directed at selected Member States and European Union institutions. These are essential to promoting accountability and democratic oversight in AI governance.",
  },
  {
    title: "Dialogue",
    body: "We advance dialogue with the European Union, the Council of Europe, and other key stakeholders through conferences, events, and targeted engagement.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-col font-sans">

      <Nav />

      {/* Hero */}
      <section className="bg-brand-white flex flex-col justify-center px-8 md:px-16 py-60 pb-30">
        <div className="max-w-4xl mx-auto w-full">
          <div className="flex flex-col gap-8 max-w-3xl">
            <h1
              className="text-5xl md:text-7xl font-light text-brand-black leading-[1.05] tracking-tight"
              style={{ textWrap: "balance" }}
            >
              Building the legal foundations for safe artificial intelligence.
            </h1>
            <Rule />
            <p className="text-xl md:text-2xl font-light text-brand-navy/80 leading-relaxed max-w-xl">
              AI governance and AI law remain in their infancy. The time to build
              this capacity is now.
            </p>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section id="mission" className="bg-brand-navy px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-8">
            <Rule />
            <h2
              className="text-4xl md:text-5xl font-light text-brand-white leading-tight max-w-2xl"
              style={{ textWrap: "balance" }}
            >
              Bringing together legal professionals to address the risks of advanced AI.
            </h2>
            <p className="text-lg md:text-xl font-light text-brand-white/70 leading-relaxed max-w-2xl">
              AI could erode democracy, destabilise the economy, be used to develop
              powerful weapons, facilitate large-scale cyberattacks, or even result in
              a loss of human control over increasingly capable systems.
            </p>
            <p className="text-lg md:text-xl font-light text-brand-white/70 leading-relaxed max-w-2xl">
              Increasing concentrations of power, capital, and technological capabilities
              in the hands of a small number of AI companies and states risk reducing
              the agency of individuals, civil society, and democratic institutions
              unless effective counterweights are developed.
            </p>
            <p className="text-lg md:text-xl font-light text-brand-white/70 leading-relaxed max-w-2xl">
              We aim to bring together legal professionals who are concerned about these
              risks and interested in using legal and administrative levers to address
              them — using these levers where they already exist, and researching and
              advocating for reform where they are outdated.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="relative w-full aspect-[4/3] md:aspect-[16/9] rounded-sm overflow-hidden">
              <Image
                src="/images/conference-didier.jpg"
                alt="Didier Coeurnelle introducing Law for AI Safety's mission at the 2nd International Conference on Large-Scale AI Risks"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 896px"
              />
            </div>
            <p className="text-sm font-light text-brand-white/60">
              Board member Didier Coeurnelle introducing Law for AI Safety&rsquo;s mission at the 2nd International Conference on Large-Scale AI Risks.
            </p>
          </div>
        </div>
      </section>

      {/* How We Work */}
      <section id="work" className="bg-brand-white px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-4xl font-light text-brand-black leading-tight">
              How we work
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {mechanisms.map((m) => (
              <div key={m.title} className="flex flex-col gap-5">
                <Rule />
                <h3 className="text-2xl font-light text-brand-black">{m.title}</h3>
                <p className="text-base font-light text-brand-navy/70 leading-relaxed">
                  {m.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brussels Effect */}
      <section className="bg-brand-black px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <blockquote
            className="text-4xl md:text-6xl font-light text-brand-white leading-tight max-w-3xl"
            style={{ textWrap: "balance" }}
          >
            &ldquo;Strategic legal and administrative pressure, combined with effective public communication, can strengthen AI governance in Europe and contribute to higher international standards.&rdquo;
          </blockquote>
          <p className="text-lg md:text-xl font-light text-brand-white/50 leading-relaxed max-w-2xl">
            Through the Brussels effect, Europe can play a leading role in building a
            broader middle-power coalition for AI safety. The expertise, institutions,
            and networks built today will help determine whether increasingly powerful
            AI systems remain accountable to democratic societies and the rule of law.
          </p>
        </div>
      </section>

      {/* Events */}
      <section className="bg-brand-white px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-16">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-4xl font-light text-brand-black leading-tight">
              Our story
            </h2>
          </div>

          {/* Timeline — gap-14=56px; line h=calc(100%+44px) bridges gap to next dot */}
          <div className="flex flex-col gap-14">

            {/* Event 1 */}
            <div className="flex gap-8">
              <div className="relative flex-shrink-0 w-3">
                <div className="w-3 h-3 rounded-full bg-brand-red mt-[10px]" aria-hidden />
                <div className="absolute top-[22px] left-[5px] w-px bg-brand-red/20 h-[calc(100%+44px)]" aria-hidden />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <h3 className="text-2xl font-light text-brand-black leading-snug max-w-xl">
                  Team meets at the European Parliament
                </h3>
                <p className="text-base font-light text-brand-navy/70 leading-relaxed max-w-2xl">
                  Our founding team first met at the <em>Beyond the AI Act: Global Security &amp; the Control
                  Problem</em> conference at the European Parliament, hosted by PauseAI and MEP Ondřej
                  Kolář. Several members of our team were involved in organising the event.
                </p>
              </div>
            </div>

            {/* Event 2 */}
            <div className="flex gap-8">
              <div className="relative flex-shrink-0 w-3">
                <div className="w-3 h-3 rounded-full bg-brand-red mt-[10px]" aria-hidden />
                <div className="absolute top-[22px] left-[5px] w-px bg-brand-red/20 h-[calc(100%+44px)]" aria-hidden />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <h3 className="text-2xl font-light text-brand-black leading-snug max-w-xl">
                  FOI requests drafted &amp; legal groundwork laid
                </h3>
                <p className="text-base font-light text-brand-navy/70 leading-relaxed max-w-2xl">
                  We drafted an initial Freedom of Information request related to the advanced risks
                  of AI, aimed at Member States, currently being finalised following review by the
                  Future of Life Institute team. We also conducted preliminary research into legal
                  and administrative levers and barriers to action, and secured pro bono support
                  from global law firm Dentons to assist with our registration in Brussels.
                </p>
              </div>
            </div>

            {/* Event 3 */}
            <div className="flex gap-8">
              <div className="relative flex-shrink-0 w-3">
                <div className="w-3 h-3 rounded-full bg-brand-red mt-[10px]" aria-hidden />
                <div className="absolute top-[22px] left-[5px] w-px bg-brand-red/20 h-[calc(100%+44px)]" aria-hidden />
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <h3 className="text-2xl font-light text-brand-black leading-snug max-w-xl">
                  Building the network
                </h3>
                <p className="text-base font-light text-brand-navy/70 leading-relaxed max-w-2xl">
                  We established a relationship with <a href="https://pauseai.info" target="_blank" rel="noopener noreferrer" className="underline hover:text-brand-black">PauseAI</a> to channel volunteers with legal
                  backgrounds to our work. Through attending conferences, we connected with experts
                  including individuals involved with the EU AI Office and AI policy organisations,
                  who have expressed willingness to collaborate on future opportunities.
                </p>
                <div className="pt-4">
                  <WipeButton
                    href="https://www.linkedin.com/company/law-for-ai-safety/"
                    className="inline-flex items-center gap-3 px-6 py-3 border border-brand-black/30 text-brand-black text-sm font-light rounded-sm overflow-hidden"
                    hoverBg="rgba(27,51,76,0.07)"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    Connect on LinkedIn
                  </WipeButton>
                </div>
              </div>
            </div>

            {/* Event 4 — no line below */}
            <div className="flex gap-8">
              <div className="flex-shrink-0 w-3 mt-[10px]">
                <div className="w-3 h-3 rounded-full bg-brand-red" aria-hidden />
              </div>
              <div className="flex flex-col gap-6 min-w-0">
              <h3 className="text-2xl font-light text-brand-black leading-snug max-w-xl">
                AI Act in Romania conference, European Parliament
              </h3>
              <div className="flex flex-col gap-4">
                <p className="text-base font-light text-brand-navy/70 leading-relaxed max-w-2xl">
                  Raphaël Weuts, Karolina Gruzel, and Cristian Teodorescu participated in the{" "}
                  <em>AI Act in Romania: From Regulation to Implementation</em> conference at the
                  European Parliament in Brussels, hosted by Maria Grapini, Vice-Chair of the
                  Committee on the Internal Market and Consumer Protection.
                </p>
                <p className="text-base font-light text-brand-navy/70 leading-relaxed max-w-2xl">
                  Attendees included Victor Negrescu, Vice-President of the European Parliament;
                  Brando Benifei, former co-rapporteur on the EU AI Act; Martin Ulbrich, AI Policy
                  Officer at the European Commission; and representatives of Romanian industry.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { src: "/images/conference-ai-act-1.jpg", alt: "Panel at AI Act in Romania conference", position: "object-center" },
                  { src: "/images/conference-ai-act-2.jpg", alt: "Speakers at AI Act in Romania conference", position: "object-top" },
                  { src: "/images/conference-ai-act-3.jpg", alt: "Presenter at AI Act in Romania conference", position: "object-center" },
                ].map((img) => (
                  <div key={img.src} className="relative w-full aspect-[4/3] rounded-sm overflow-hidden">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className={`object-cover ${img.position}`}
                      sizes="(max-width: 768px) 100vw, 298px"
                    />
                  </div>
                ))}
              </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section id="team" className="bg-brand-navy px-8 md:px-16 py-28 md:py-40">
        <div className="max-w-4xl mx-auto flex flex-col gap-12">
          <div className="flex flex-col gap-4">
            <Rule />
            <h2 className="text-4xl font-light text-brand-white leading-tight">
              Founding team
            </h2>
          </div>

          <div className="relative w-full aspect-[16/9] mb-4 rounded-sm overflow-hidden">
            <Image
              src="/images/team-group.jpg"
              alt="Law for AI Safety founding team at the European Parliament"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 896px"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {team.map((person) => (
              <div key={person.name} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-xl font-light text-brand-white">{person.name}</p>
                  <a
                    href={person.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${person.name} on LinkedIn`}
                    className="flex-shrink-0 text-brand-white/50 hover:text-brand-white transition-colors duration-200"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                  </a>
                </div>
                <p className="text-sm font-light text-brand-white/80">{person.role}</p>
                <p className="text-sm font-light text-brand-white/60 leading-relaxed mt-1">
                  {person.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact */}
      <section id="contact" className="bg-brand-white px-8 md:px-16 py-28 md:py-40 border-t border-brand-black/10">
        <div className="max-w-4xl mx-auto flex flex-col gap-8">
          <Rule />
          <h2
            className="text-4xl md:text-5xl font-light text-brand-black leading-tight max-w-xl"
            style={{ textWrap: "balance" }}
          >
            Join us in shaping the legal future of AI
          </h2>
          <p className="text-lg md:text-xl font-light text-brand-navy/70 leading-relaxed max-w-2xl">
            Whether you are a lawyer, a policymaker, a researcher, or someone who
            cares about the long-term future of AI governance, there are ways to
            contribute to this work.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <WipeButton
              href="mailto:hello@lawforaisafety.org"
              className="px-8 py-4 border border-brand-black/30 text-brand-black text-base font-light rounded-sm overflow-hidden"
              hoverBg="rgba(27,51,76,0.07)"
            >
              Contact us
            </WipeButton>
            <WipeButton
              href="#"
              className="px-8 py-4 bg-brand-red text-brand-white text-base font-light rounded-sm overflow-hidden"
              hoverBg="rgba(255,255,255,0.15)"
            >
              Follow our work
            </WipeButton>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-brand-black px-8 md:px-16 py-12">
        <div className="max-w-4xl mx-auto flex flex-row justify-between items-center gap-6">
          <Image
            src="/logo.svg"
            alt="Law for AI Safety"
            width={160}
            height={48}
            className="w-36 brightness-0 invert opacity-40"
          />
          <p className="text-sm font-light text-brand-white/50">
            © {new Date().getFullYear()} Law for AI Safety. All rights reserved.
          </p>
        </div>
      </footer>

    </main>
  );
}
