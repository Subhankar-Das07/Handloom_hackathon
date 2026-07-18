const { Client } = require('pg');

async function seedSchemes() {
  const client = new Client({
    user: 'root',
    host: 'localhost',
    database: 'tanthavi_dev',
    password: 'password',
    port: 5432,
  });

  try {
    await client.connect();
    console.log("Connected to DB, inserting schemes...");

    const schemes = [
      {
        title: "National Handloom Development Programme (NHDP)",
        description: "Financial assistance for looms, accessories, and solar lighting systems to weavers across India.",
        department: "Ministry of Textiles",
        amount: "₹25,000",
        url: "http://handlooms.nic.in/",
        criteria: { state: "All", income: "Any", hasLoom: true }
      },
      {
        title: "Mudra Yojana for Weavers",
        description: "Concessional credit and margin money assistance for weaver-entrepreneurs to expand their business.",
        department: "Ministry of MSME",
        amount: "Up to ₹50,000",
        url: "https://www.mudra.org.in/",
        criteria: { state: "All", income: "1L-3L", hasLoom: false }
      },
      {
        title: "Odisha State Weaver Support Subsidy",
        description: "A special subsidy provided by the Odisha government to support rural handloom communities.",
        department: "Dept of Handlooms, Textiles & Handicrafts (Odisha)",
        amount: "₹10,000 per annum",
        url: "https://textiles.odisha.gov.in/",
        criteria: { state: "Odisha", income: "<1L", hasLoom: true }
      },
      {
        title: "Gujarat Vahali Dikri Yojana (Weaver Families)",
        description: "Special provisions for families of handloom weavers in Gujarat under the state's girl child support program.",
        department: "Women and Child Development, Gujarat",
        amount: "₹1,10,000",
        url: "https://wcd.gujarat.gov.in/",
        criteria: { state: "Gujarat", income: "<1L", hasLoom: false }
      },
      {
        title: "Silk Samagra (Central Sector Scheme)",
        description: "Support for silk weavers, focusing on capacity building, technology upgrades, and working capital.",
        department: "Central Silk Board",
        amount: "Variable (Technology Subsidy)",
        url: "http://csb.gov.in/",
        criteria: { state: "All", income: "Any", hasLoom: true }
      }
    ];

    for (const s of schemes) {
      await client.query(`
        INSERT INTO government_schemes (
          id, title, description, department_name, benefit_amount, apply_url, eligibility_criteria, is_active, created_at, updated_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6::jsonb, true, NOW(), NOW()
        )
      `, [s.title, s.description, s.department, s.amount, s.url, JSON.stringify(s.criteria)]);
    }

    console.log("Seeding complete!");
  } catch (err) {
    console.error("Error seeding:", err);
  } finally {
    await client.end();
  }
}

seedSchemes();
