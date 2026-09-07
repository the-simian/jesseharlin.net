/**
 * The tower's floors and the books on them. Up is the public record, later in
 * life the higher you climb. Down is the_simian, the artist. Facts are drawn
 * from Jesse's dossier; every book links to one public source.
 *
 * Floors are ordered top to bottom as the page renders them: the observatory
 * first, the pool last, the door in the middle where the visitor arrives.
 */

export type Book = {
  /** Oblique is allowed; the book is where the cryptic lives. */
  title: string;
  year: string;
  kind: "code" | "music" | "art" | "community" | "talk" | "life";
  text: string;
  link: { label: string; href: string };
};

export type Floor = {
  id: string;
  /** Signed level relative to the door. Positive climbs, negative descends. */
  level: number;
  name: string;
  /** One line under the name; plain language for the two-second read. */
  caption: string;
  books: Book[];
};

export const FLOORS: Floor[] = [
  {
    id: "observatory",
    level: 7,
    name: "The Observatory",
    caption: "The record ends here, in the present. Look through the telescope.",
    books: [],
  },
  {
    id: "present",
    level: 6,
    name: "The Present",
    caption: "2023 to now. A software shop, a game score, and tools for makers.",
    books: [
      {
        title: "Forty-Four Million Points",
        year: "2023",
        kind: "code",
        text: "A client needed seismic reflection data on screen in a browser. The SEG-Y format dates to 1973 and was designed for tape; one file held 441 million data points. Protocol Buffers on the wire, Lambda and S3 behind, WebGL in front. 44.1 million points rendered, with a payload about half the size of JSON. Told at OKC WebDevs as Protobufs and More.",
        link: { label: "Protobufs and More, the slides", href: "https://slides.com/jesseharlin" },
      },
      {
        title: "The Names of Colours",
        year: "2026",
        kind: "code",
        text: "chromonym takes an RGB or hex value and returns a human name, resolved by perceptual distance across twelve palette sets from CSS and X11 to Pantone, Crayola, and XKCD. Fully typed and tree-shakeable. Its sibling unitforge does the same job for units of measure: three functions, three registries, any domain. Both were tools Jesse needed and then published.",
        link: { label: "chromonym on GitHub", href: "https://github.com/simiancraft/chromonym" },
      },
      {
        title: "One Server Per Service Per Account",
        year: "2026",
        kind: "code",
        text: "google-mcp-suite lets coding agents operate Gmail, Calendar, Drive, Docs, and Sheets. Identity is fixed when each server starts, so several accounts run in parallel and an agent cannot act on the wrong one. Over a hundred operations, each checked against Google's published reference. Jesse's own agents run on it every day.",
        link: {
          label: "google-mcp-suite",
          href: "https://github.com/simiancraft/google-mcp-suite",
        },
      },
      {
        title: "Fists Only",
        year: "2026",
        kind: "music",
        text: "Voltage High Society is a first-person Metroidvania on a prison island of cybernetic horrors, by the Finnish studio Platonic Partnership. Jesse scored it: his first retail game credit, after a collaboration with its developer that began with a Half-Life 2 mod in 2009. The developer's public letter praises tracks that evolve rather than loop. Released June 2026.",
        link: {
          label: "Music of Voltage High Society",
          href: "https://store.steampowered.com/news/app/2063480?emclan=103582791472088894&emgid=529865894144246287",
        },
      },
      {
        title: "Six Tales of Agentic Terror",
        year: "2026",
        kind: "talk",
        text: "Tales from the Dark Factory: an EC-comics horror anthology about working with coding agents, given at The Verge OKC. A generation ship tended by an android who cannot read frames six stories, including an honesty goblin and a stone too heavy to lift. The deck was built by the technique it describes, with a human reading everything.",
        link: {
          label: "The deck",
          href: "https://slides.com/jesseharlin/tales-from-the-dark-factory",
        },
      },
    ],
  },
  {
    id: "interplanetary",
    level: 5,
    name: "The Interplanetary Office",
    caption: "2021 to 2022. Distributed storage at Protocol Labs.",
    books: [
      {
        title: "Under Mikeal",
        year: "2021",
        kind: "code",
        text: "At Protocol Labs Jesse worked on the IPLD team under the late Mikeal Rogers, with J. Chris Anderson as a second lead. He owned the AWS infrastructure connecting NFT.Storage, Web3.Storage, and NiftySave, built on SST in its pre-Ion era, and shipped 35 merged pull requests into the nft.storage monorepo, most of them the parallel ingest pipeline.",
        link: {
          label: "The pull requests",
          href: "https://github.com/nftstorage/nft.storage/pulls?q=is%3Apr+author%3Athe-simian+is%3Aclosed",
        },
      },
      {
        title: "Pull Request Number One",
        year: "2022",
        kind: "code",
        text: "w3up-cli, the command line for Web3.Storage, began with Jesse's first pull request and reached version 1.0.0 in his tenth, 35 commits across 25 files. He ended as the second contributor of all time with 122 commits. The repo was later archived and its replacement started fresh, so the contributors graph on the original is the receipt.",
        link: {
          label: "Contributors graph",
          href: "https://github.com/web3-storage/w3up-cli/graphs/contributors",
        },
      },
      {
        title: "Premiered in Dublin",
        year: "2022",
        kind: "talk",
        text: "The CLI premiered in a workshop at NodeConf EU 22 on 4 October 2022, where Web3.Storage was a platinum sponsor. Its headline capability, uploading files of any size by chunking them into content-addressed archives, was the work that started in the first pull request.",
        link: {
          label: "NearForm's announcement",
          href: "https://nearform.com/insights/web3-storage-platinum-sponsor-nodeconf-eu-22/",
        },
      },
    ],
  },
  {
    id: "toolroom",
    level: 4,
    name: "The Toolroom",
    caption: "2014 to 2019. Tools for people who make things.",
    books: [
      {
        title: "A Level Editor Without PHP",
        year: "2014",
        kind: "code",
        text: "Weltmeister, the level editor that ships with the Impact game engine, needed a PHP backend. impact-worldmaster replaced it with Node and Express so an Impact game could be built end to end in one language. Five versions in three days. The first of three level editors Jesse would contribute to.",
        link: {
          label: "impact-worldmaster",
          href: "https://github.com/the-simian/impact-worldmaster",
        },
      },
      {
        title: "Create Phaser App",
        year: "2018",
        kind: "code",
        text: "A scaffold for Phaser 3 games with a modern build, mentioned in Phaser World issue 123 and passed around the Phaser and Tiled forums. It sits alongside three Phaser webpack loaders and a slush generator from 2015. The same scaffold later became the foundation under a permanent installation in Oklahoma City.",
        link: {
          label: "create-phaser-app",
          href: "https://github.com/simiancraft/create-phaser-app",
        },
      },
      {
        title: "The Babylon Editor",
        year: "2019",
        kind: "code",
        text: "Bugs filed, a pull request merged, official documentation written, and a boilerplate repository authored for the Babylon.js Editor. The 3D stack Jesse was maintaining for other people is the one he then used to build the Bubble Room, which is why the two floors below the door and the observatory above it are made of the same thing.",
        link: { label: "Babylon.js Editor", href: "https://github.com/BabylonJS/Editor" },
      },
      {
        title: "Plato, Continued",
        year: "2015",
        kind: "code",
        text: "es6-plato carries on Mozilla's Plato, a static analysis and code visualisation tool, with the older parsing and linting replaced. Around two hundred stars, and reused inside several of Jesse's own build pipelines and talks about them.",
        link: { label: "es6-plato", href: "https://github.com/the-simian/es6-plato" },
      },
    ],
  },
  {
    id: "meeting-room",
    level: 3,
    name: "The Meeting Room",
    caption: "2012 to 2018. Building the rooms other builders meet in.",
    books: [
      {
        title: "Tuesday Nights",
        year: "2012",
        kind: "community",
        text: "Jesse co-founded OKCjs, Oklahoma City's JavaScript user group, and ran it week over week for years, speaking at it at least eleven times between 2012 and 2017. He built and rebuilt its website three times, the last on Hexo with a theme of his own.",
        link: { label: "OKCjs", href: "https://okcjs.com/" },
      },
      {
        title: "A Foundation",
        year: "2014",
        kind: "community",
        text: "Techlahoma is the nonprofit that grew out of the user groups, co-founded with Vance Lucas and Amanda Harlin. Jesse served on its board from 2015 to 2018 and built sites for a dozen groups and conferences under its banner: OKC.Net, OKC Python, BSidesOK, Oklahoma Open Hardware.",
        link: { label: "Techlahoma", href: "https://techlahoma.org/" },
      },
      {
        title: "Thunder on the Plains",
        year: "2014",
        kind: "community",
        text: "ThunderPlains, a JavaScript conference in Oklahoma City, co-founded and given its websites for 2014 through 2017. Regional, recurring, and real: the kind of conference that produces the engineers who later speak at it.",
        link: { label: "ThunderPlains", href: "https://thunderplains.com/" },
      },
      {
        title: "Pairing Only",
        year: "2014",
        kind: "code",
        text: "Staff solutions architect at Telogical Systems, a telecom analytics shop that practised mandatory pair programming, reporting to Raymond Lewallen, author of the widely taught article on the four principles of object-oriented programming. The cucumber-js scenario-outline work with Ben Van Treese comes from this era.",
        link: { label: "cucumber-js", href: "https://github.com/cucumber/cucumber-js" },
      },
      {
        title: "A Map You Could Touch",
        year: "2017",
        kind: "code",
        text: "The University of Oklahoma's interactive campus map, React over the Google Maps API, built through simiancraft and deployed on a touchscreen kiosk in the student union. It stayed live for years until the API beneath it changed. simiancraft itself was founded in 2016.",
        link: { label: "simiancraft", href: "https://simiancraft.com/" },
      },
    ],
  },
  {
    id: "workshop",
    level: 2,
    name: "The Workshop",
    caption: "2008 to 2011. Algorithmic music, a clearance, and a windmill.",
    books: [
      {
        title: "Bot Fugues",
        year: "2008",
        kind: "music",
        text: "The Workshop in Algorithmic Computer Music at UC Santa Cruz, two competitive weeks under David Cope with Peter Elsea and Paul Nauert on the panel. Jesse applied with a portfolio of generative Max/MSP work and was the only student that year to finish two final projects. Markov chains and feature detection, years before they were called machine learning.",
        link: { label: "David Cope", href: "https://en.wikipedia.org/wiki/David_Cope" },
      },
      {
        title: "No Weapons or Fighting",
        year: "2009",
        kind: "music",
        text: "Flesh, a survival horror mod for Half-Life 2 with no combat at all, predating Amnesia. Jesse composed its thirteen-track soundtrack for developer Henri Tervapuro, beginning a collaboration that reached a retail game seventeen years later. Scintilla followed in 2011 with eight more tracks.",
        link: {
          label: "Flesh, the soundtrack",
          href: "https://soundcloud.com/harlinjesse/sets/flesh",
        },
      },
      {
        title: "Asset 782",
        year: "2010",
        kind: "art",
        text: "The Unity Asset Store opened in November 2010. Among its first few hundred listings was Rustic Farm Windmill by Simian Assets, a finely crafted windmill with a turning pinwheel, suitable for farms and horror. Three-digit asset IDs put Jesse in the launch-week batch of publishers.",
        link: {
          label: "The archived listing",
          href: "https://www.gameassetdeals.com/asset/782/rustic-farm-windmill",
        },
      },
      {
        title: "Compartments",
        year: "2010",
        kind: "life",
        text: "Government work at Tinker Air Force Base under a top secret clearance, alongside CompTIA A+ and Linux+ certifications. The compartmentalisation he saw there shaped how he later designed adversarial agent systems: separate powers, non-overlapping specialties, review by someone who cannot see your notes.",
        link: { label: "Tinker AFB", href: "https://www.tinker.af.mil/" },
      },
    ],
  },
  {
    id: "farm",
    level: 1,
    name: "The Farm",
    caption: "Rural Oklahoma. Where the straight lines came from.",
    books: [
      {
        title: "Second in the State",
        year: "2000",
        kind: "life",
        text: "A farm childhood, straight A's, second place in the Oklahoma state science fair, All-State band, and the Sousa Band Award. In May 2000 Moore High School gave him the University of Oklahoma College of Engineering Distinguished Alumni Scholarship. He expected to max out whatever he touched, and mostly did.",
        link: { label: "Norman, Oklahoma", href: "https://en.wikipedia.org/wiki/Norman,_Oklahoma" },
      },
      {
        title: "Patch Cables",
        year: "2004",
        kind: "music",
        text: "The first programming environment was Max/MSP, wiring a synthesizer he was building for himself. The first line of JavaScript he ever wrote lived inside that synth. He told 405 Magazine years later that he began programming to make constrained musical systems that could still surprise their author.",
        link: {
          label: "405 Magazine, 2016",
          href: "https://www.405magazine.com/making-programming-magic-together/",
        },
      },
      {
        title: "Every Synth on the Floor",
        year: "2005",
        kind: "life",
        text: "The keyboard department at Guitar Center. He could program every synthesizer in the room and sold them by meaning it. Watching a sales script fail and honest enthusiasm work is where his later thinking about scripted versus authentic communication began.",
        link: { label: "the_simian on SoundCloud", href: "https://soundcloud.com/harlinjesse" },
      },
    ],
  },
  {
    id: "door",
    level: 0,
    name: "Jesse Harlin",
    caption: "Engineer, composer, installation artist. Norman, Oklahoma.",
    books: [],
  },
  {
    id: "listening-room",
    level: -1,
    name: "The Listening Room",
    caption: "the_simian. Braindance, in odd meters.",
    books: [
      {
        title: "Particular Favorites",
        year: "2021",
        kind: "music",
        text: "Freeze-Tile, on the Barcelona label x4records' compilation titled with a flying saucer emoji. Igloo Magazine named it among the particular favorites on the day of release. Four x4 compilations followed between 2021 and 2025, three of them reviewed; the label's titles are emoji, so none of them can be pronounced.",
        link: { label: "x4records", href: "https://x4records.bandcamp.com/" },
      },
      {
        title: "Seven Minutes in Five",
        year: "2025",
        kind: "music",
        text: "clandestine_retrieval runs seven minutes in 5/4, with mysterious pads, detuned chimes, and gradual development from granular to smooth. Jarvix played it in full as Hot Dog! Song of the Week, on the NPR podcast directory, and connected the track to the arcade cabinet three floors below this one.",
        link: {
          label: "On Bandcamp",
          href: "https://x4records.bandcamp.com/track/the-simian-clandestine-retrieval",
        },
      },
      {
        title: "Not Recommended for Parties",
        year: "2019",
        kind: "music",
        text: "Rust collects six tracks written for an annual February record-an-album collective between 2017 and 2021, from Rusty Fingers to Regeneration Knife, as one body of work. The description is the artist's own. An earlier set, The Dusty Circuits, reaches back to 2014 with titles like A Wire Garden and Reflections On A Mote Of Dust.",
        link: { label: "Rust", href: "https://soundcloud.com/harlinjesse/sets/nine-to-five-rust" },
      },
      {
        title: "Twenty Years of Drukqs",
        year: "2021",
        kind: "music",
        text: "For the twentieth anniversary of Aphex Twin's Drukqs, a community of thirty-odd artists reworked the album. Jesse's Petrichor remix of Bbydhyonchord is track six of the release on Braindance News Community. He is on Discogs as The Simian, six credits, and on no streaming service at all; the scene lives on Bandcamp.",
        link: { label: "Discogs", href: "https://www.discogs.com/artist/10174360" },
      },
    ],
  },
  {
    id: "mixtape",
    level: -2,
    name: "Two Rooms in a Mixtape",
    caption: "Installation art, on display in Oklahoma City since 2019.",
    books: [
      {
        title: "Lemon Star Zero",
        year: "2019",
        kind: "art",
        text: "An arcade cabinet inside the Angst Room at Factory Obscura's Mixtape. A side-scrolling shooter in convincing 16-bit style, entirely original, scored on the Sega Genesis' YM2612 FM chip, and built to be genuinely, artistically frustrating: the frustration is the content. Jesse did everything but fabricate the cabinet: art, code, music, and the controller wiring. It still runs.",
        link: {
          label: "The soundtrack",
          href: "https://soundcloud.com/harlinjesse/sets/lemon-star-zero",
        },
      },
      {
        title: "The Bubble Room",
        year: "2019",
        kind: "art",
        text: "The Joy Room at Mixtape, built on Babylon.js with algorithmic music: the Santa Cruz training deployed in a paid public installation. Factory Obscura supplied the concept; Jesse built the whole realisation under the simiancraft name. The engine is the one he had spent the year before fixing for other people.",
        link: { label: "Factory Obscura", href: "https://factoryobscura.com/" },
      },
      {
        title: "Not a Readymade",
        year: "2019",
        kind: "art",
        text: "Why a game in a room is art and not a product: context makes it legible, as Duchamp showed with a urinal. The analogy stops there. Duchamp did not make the urinal. Every pixel, note, and line of Lemon Star Zero is self-authored, then recontextualised. The skills overlap with the games industry; the industries do not.",
        link: {
          label: "simiancraft's project page",
          href: "https://simiancraft.com/projects/lemonstarzero/",
        },
      },
    ],
  },
  {
    id: "score",
    level: -3,
    name: "The Score",
    caption: "How the thinking works. Same job, different cables.",
    books: [
      {
        title: "Composing Off the Map",
        year: "2018",
        kind: "talk",
        text: "A guest masterclass at the University of Oklahoma, the same thesis as an earlier talk titled Everything I Learned About Programming I Learned From Music. Neither title is a figure of speech. When he describes an architecture as having weight, pacing, and room, the vocabulary is borrowed from the art that had words for it first.",
        link: { label: "The slides", href: "https://slides.com/jesseharlin/composing-off-the-map" },
      },
      {
        title: "Incidental Harmony",
        year: "always",
        kind: "music",
        text: "He almost never writes block chords. A progression is a skeleton; the finished texture is independent lines passing through one another, with the verticals arising as a side effect. Aeolian is home, quartal stacks replace dominants, and the tension at a climax comes from a non-functional cluster approached by step. The instrument at either end of this tower is tuned to those intervals.",
        link: { label: "the_simian", href: "https://soundcloud.com/harlinjesse" },
      },
      {
        title: "All Made of Tunes",
        year: "always",
        kind: "life",
        text: "He identifies, carefully, with Charles Ives: a composer who fused incompatible traditions into one voice. The claim here is smaller and true. Code, sound, rooms, and communities have all been the same activity for him: find the shape that wants to emerge, decide which constraints are load-bearing, ship it. The people around him changed. The work did not.",
        link: {
          label: "Ives, All Made of Tunes",
          href: "https://yalebooks.yale.edu/book/9780300102123/all-made-of-tunes/",
        },
      },
    ],
  },
  {
    id: "pool",
    level: -4,
    name: "The Pool",
    caption: "Look down. The same sky, mirrored.",
    books: [],
  },
];
