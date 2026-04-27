export type CountrySlug = "thailand" | "vietnam" | "bali" | "kl" | "uae";

export interface District {
  slug: string;
  name: { ru: string; en: string };
}

export interface City {
  slug: string;
  name: { ru: string; en: string };
  districts?: District[];
}

export interface Country {
  slug: CountrySlug;
  flag: string;
  name: { ru: string; en: string };
  /** Optional short label shown as the picker heading (e.g. "Тай" instead of "Тайланд"). */
  shortName?: { ru: string; en: string };
  cities: City[];
}

export const COUNTRIES: Country[] = [
  {
    slug: "thailand",
    flag: "🇹🇭",
    name: { ru: "Тайланд", en: "Thailand" },
    shortName: { ru: "Тай", en: "Thai" },
    cities: [
      {
        slug: "phuket",
        name: { ru: "Пхукет", en: "Phuket" },
        districts: [
          { slug: "phuket-patong", name: { ru: "Патонг", en: "Patong" } },
          { slug: "phuket-kata", name: { ru: "Ката", en: "Kata" } },
          { slug: "phuket-karon", name: { ru: "Карон", en: "Karon" } },
          { slug: "phuket-rawai", name: { ru: "Раваи", en: "Rawai" } },
          { slug: "phuket-chalong", name: { ru: "Чалонг", en: "Chalong" } },
          { slug: "phuket-bangtao", name: { ru: "Банг Тао", en: "Bang Tao" } },
          { slug: "phuket-surin", name: { ru: "Сурин", en: "Surin" } },
        ],
      },
      {
        slug: "bangkok",
        name: { ru: "Бангкок", en: "Bangkok" },
        districts: [
          { slug: "bkk-sukhumvit", name: { ru: "Сукхумвит", en: "Sukhumvit" } },
          { slug: "bkk-silom", name: { ru: "Силом", en: "Silom" } },
          { slug: "bkk-sathorn", name: { ru: "Сатхон", en: "Sathorn" } },
          { slug: "bkk-thonglor", name: { ru: "Тхонглор", en: "Thonglor" } },
          { slug: "bkk-ekkamai", name: { ru: "Эккамай", en: "Ekkamai" } },
          { slug: "bkk-ari", name: { ru: "Ари", en: "Ari" } },
          { slug: "bkk-phromphong", name: { ru: "Пхром Понг", en: "Phrom Phong" } },
          { slug: "bkk-asok", name: { ru: "Асок", en: "Asok" } },
        ],
      },
      {
        slug: "pattaya",
        name: { ru: "Паттайя", en: "Pattaya" },
        districts: [
          { slug: "pattaya-central", name: { ru: "Центр", en: "Central" } },
          { slug: "pattaya-jomtien", name: { ru: "Джомтьен", en: "Jomtien" } },
          { slug: "pattaya-naklua", name: { ru: "Наклуа", en: "Naklua" } },
          { slug: "pattaya-pratamnak", name: { ru: "Пратамнак", en: "Pratamnak" } },
          { slug: "pattaya-wongamat", name: { ru: "Вонг Амат", en: "Wong Amat" } },
        ],
      },
      {
        slug: "samui",
        name: { ru: "Самуи", en: "Samui" },
        districts: [
          { slug: "samui-chaweng", name: { ru: "Чавенг", en: "Chaweng" } },
          { slug: "samui-lamai", name: { ru: "Ламай", en: "Lamai" } },
          { slug: "samui-bophut", name: { ru: "Бопхут", en: "Bophut" } },
          { slug: "samui-maenam", name: { ru: "Маенам", en: "Maenam" } },
          { slug: "samui-nathon", name: { ru: "Натон", en: "Nathon" } },
        ],
      },
    ],
  },
  {
    slug: "vietnam",
    flag: "🇻🇳",
    name: { ru: "Вьетнам", en: "Vietnam" },
    shortName: { ru: "Вьет", en: "Viet" },
    cities: [
      {
        slug: "hochiminh",
        name: { ru: "Хошимин", en: "Ho Chi Minh" },
        districts: [
          { slug: "hcm-d1", name: { ru: "Центр (D1)", en: "District 1" } },
          { slug: "hcm-thaodien", name: { ru: "Тхао Дьен", en: "Thao Dien" } },
          { slug: "hcm-phumyhung", name: { ru: "Фу Ми Хынг", en: "Phu My Hung" } },
          { slug: "hcm-binhthanh", name: { ru: "Бинь Тхань", en: "Binh Thanh" } },
          { slug: "hcm-phunhuan", name: { ru: "Фу Нюан", en: "Phu Nhuan" } },
        ],
      },
      {
        slug: "danang",
        name: { ru: "Дананг", en: "Da Nang" },
        districts: [
          { slug: "dn-mykhe", name: { ru: "Май Кхе", en: "My Khe" } },
          { slug: "dn-sontra", name: { ru: "Сон Тра", en: "Son Tra" } },
          { slug: "dn-haichau", name: { ru: "Хай Чау", en: "Hai Chau" } },
          { slug: "dn-nguhanhson", name: { ru: "Нгу Хань Сон", en: "Ngu Hanh Son" } },
        ],
      },
      {
        slug: "nhatrang",
        name: { ru: "Нячанг", en: "Nha Trang" },
        districts: [
          { slug: "nt-center", name: { ru: "Центр", en: "Center" } },
          { slug: "nt-tranphu", name: { ru: "Чан Фу", en: "Tran Phu" } },
          { slug: "nt-vinpearl", name: { ru: "Винперл", en: "Vinpearl" } },
          { slug: "nt-north", name: { ru: "Северный пляж", en: "North Beach" } },
        ],
      },
    ],
  },
  {
    slug: "bali",
    flag: "🇮🇩",
    name: { ru: "Бали", en: "Bali" },
    cities: [
      {
        slug: "bali",
        name: { ru: "Бали", en: "Bali" },
        districts: [
          { slug: "bali-canggu", name: { ru: "Чангу", en: "Canggu" } },
          { slug: "bali-seminyak", name: { ru: "Семиньяк", en: "Seminyak" } },
          { slug: "bali-kuta", name: { ru: "Кута", en: "Kuta" } },
          { slug: "bali-ubud", name: { ru: "Убуд", en: "Ubud" } },
          { slug: "bali-sanur", name: { ru: "Санур", en: "Sanur" } },
          { slug: "bali-uluwatu", name: { ru: "Улувату", en: "Uluwatu" } },
          { slug: "bali-denpasar", name: { ru: "Денпасар", en: "Denpasar" } },
        ],
      },
    ],
  },
  {
    slug: "kl",
    flag: "🇲🇾",
    name: { ru: "Куала-Лумпур", en: "Kuala Lumpur" },
    cities: [
      {
        slug: "kl",
        name: { ru: "Куала-Лумпур", en: "Kuala Lumpur" },
        districts: [
          { slug: "kl-bukitbintang", name: { ru: "Bukit Bintang", en: "Bukit Bintang" } },
          { slug: "kl-klcc", name: { ru: "KLCC", en: "KLCC" } },
          { slug: "kl-bangsar", name: { ru: "Bangsar", en: "Bangsar" } },
          { slug: "kl-montkiara", name: { ru: "Mont Kiara", en: "Mont Kiara" } },
          { slug: "kl-ttdi", name: { ru: "TTDI", en: "TTDI" } },
          { slug: "kl-damansara", name: { ru: "Damansara", en: "Damansara" } },
        ],
      },
    ],
  },
  {
    slug: "uae",
    flag: "🇦🇪",
    name: { ru: "ОАЭ", en: "UAE" },
    shortName: { ru: "ОАЭ", en: "UAE" },
    cities: [
      {
        slug: "dubai",
        name: { ru: "Дубай", en: "Dubai" },
        districts: [
          { slug: "dxb-marina", name: { ru: "Dubai Marina", en: "Dubai Marina" } },
          { slug: "dxb-jbr", name: { ru: "JBR", en: "JBR" } },
          { slug: "dxb-downtown", name: { ru: "Downtown", en: "Downtown" } },
          { slug: "dxb-businessbay", name: { ru: "Business Bay", en: "Business Bay" } },
          { slug: "dxb-palm", name: { ru: "Palm Jumeirah", en: "Palm Jumeirah" } },
          { slug: "dxb-jvc", name: { ru: "JVC", en: "JVC" } },
          { slug: "dxb-deira", name: { ru: "Deira", en: "Deira" } },
        ],
      },
      {
        slug: "abudhabi",
        name: { ru: "Абу-Даби", en: "Abu Dhabi" },
        districts: [
          { slug: "auh-corniche", name: { ru: "Корниш", en: "Corniche" } },
          { slug: "auh-yas", name: { ru: "Яс Айленд", en: "Yas Island" } },
          { slug: "auh-saadiyat", name: { ru: "Саадият", en: "Saadiyat" } },
          { slug: "auh-reem", name: { ru: "Аль Рим", en: "Al Reem" } },
        ],
      },
    ],
  },
];

export const findCity = (citySlug: string) => {
  for (const c of COUNTRIES) {
    const city = c.cities.find((x) => x.slug === citySlug);
    if (city) return { country: c, city };
  }
  return null;
};

export const findDistrict = (districtSlug: string): District | null => {
  for (const c of COUNTRIES) {
    for (const city of c.cities) {
      const d = city.districts?.find((x) => x.slug === districtSlug);
      if (d) return d;
    }
  }
  return null;
};
