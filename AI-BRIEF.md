# AI Туслах — Сайжруулалтын брифинг (Fable 5-д зориулав)

> Энэ файлыг Fable 5 (эсвэл өөр AI зөвлөх)-д бүтнээр нь хуулж өгөөд, доорх "Асуух асуултууд" хэсгээс сонгож асууна уу. Бүх context энд бий.

---

## 1. Систем юу вэ?

**AiCargo** — Монголын карго (ачаа тээвэр) компаниудад зориулсан multi-tenant вэб систем. Хятадаас Монгол руу ачаа тээвэрлэдэг компаниуд өөрсдийн subdomain (`darkhan.aicargo.mn` гэх мэт) дээр ажилладаг.

- **1000+ хэрэглэгчтэй**, олон карго компани.
- Ачаа дараах статусаар дамждаг: `REGISTERED` (бүртгүүлсэн) → `EREEN_ARRIVED` (Эрээнд/хилд ирсэн) → `ARRIVED` (Монголд/Дархан ирсэн) → `PICKED_UP` (хэрэглэгч авсан).
- **Хэрэглэгч (USER)**: өөрийн ачаагаа хардаг, төлбөрөө шалгадаг.
- **Админ (ADMIN)**: бүх ачаа, хэрэглэгч, тайлан, статистикийг удирддаг.

## 2. Технологи

- Next.js 16 (App Router), TypeScript, Prisma + PostgreSQL (Supabase)
- **AI**: OpenAI SDK, model = `gpt-4o-mini`, tool/function-calling loop
- Rate limit: Upstash Redis (admin 30/өдөр, user 10/өдөр)
- Хостинг: Vercel

## 3. Дата модель (гол хэсэг)

```
Cargo (карго компани): name, slug, ereemReceiver, ereemPhone, ereemAddress,
       tariff, contactInfo, bankName, bankAccountNumber, faqs[], ...
User: name, phone (unique), email, role (USER/ADMIN/SUPER_ADMIN), cargoId, shipments[]
Shipment (ачаа): trackCode, description, status, userId, phone, adminPrice (Decimal),
       adminNote, archived, cargoId, createdAt, updatedAt
Faq: question, answer, order, cargoId
Notification, Banner, AiConfig(userPrompt, adminPrompt), ...
```

## 4. AI-н одоогийн бүтэц

Хоёр тусдаа AI endpoint байдаг:

### A) User AI (`/api/user/ai`) — яриа хэлбэрийн туслах
Хэрэглэгч өөрийн ачаа/төлбөр/компанийн мэдээллийг асууна.

**Tool-ууд** (`lib/user-ai-tools.ts`):
- `get_my_shipment_stats` — статус бүрийн тоо + `totalValue` (нийт төлбөр)
- `get_my_shipments_by_status` — статусаар ачаа
- `get_my_recent_shipments` — сүүлийн ачаа
- `get_cargo_public_info` — тариф, хаяг, банк, цаг
- `get_cargo_faq` — FAQ
- `ask_clarification` — асуулт тодорхойгүй үед тодруулах (2-4 сонголт товч)

**System prompt (одоогийн):**
```
Чи "{cargoName}" карго компанийн хэрэглэгч {userName}-д туслах AI юм.
Эх сурвалж: зөвхөн tool-оос ирсэн өгөгдөл. Таамаглах, зохиохыг хатуу хориглоно.
Байхгүй бол "Мэдэгдэхгүй байна" гэж хэл.

Tool сонгох:
- Ачааны байдал, ирсэн эсэх → get_my_recent_shipments
- Нийт тоо, статистик → get_my_shipment_stats
- Хэдэн төгрөг төлөх вэ, өр, төлбөр → get_my_shipment_stats-ийн totalValue-г ₮-өөр хэл
- Компанийн цаг/хаяг/банк/тариф/дүрэм → ЗААВАЛ get_cargo_faq, дараа нь get_cargo_public_info
- Асуулт тодорхойгүй → ask_clarification

Хариултын хэлбэр:
- Хамгийн богино. 1 өгүүлбэр хангалттай бол 2 бичихгүй.
- Тоон өгөгдөл: зөвхөн тоо+нэр.
- Markdown, ** хэрэглэхгүй.
- Статус: REGISTERED→бүртгүүлсэн, EREEN_ARRIVED→Эрээнд ирсэн, ARRIVED→ирсэн, PICKED_UP→авсан
```

### B) Admin AI (`/api/admin/ai`) — задлан шинжилгээний туслах
Саяхан **үүргээр нь дахин зохион байгуулсан**: жагсаалт дамппдаггүй, задлан шинжилгээ + одоо байгаа хуудас руу deep-link өгдөг болгосон.

**Tool-ууд** (`lib/ai-tools.ts`):
- Задлан шинжилгээ (текстээр хариулна): `get_shipment_stats`, `get_arrival_stats_by_date`, `get_oldest_pending_shipments`, `get_most_active_users`, `get_top_value_users`
- Хайлт (дүгнэлт + deep-link буцаана, жагсаалт биш): `search_shipments`, `get_user_info`, `get_shipments_by_status`, `get_ereen_arrived_details`
- `get_cargo_info`, `get_notifications`, `get_faq_list`
- `ask_clarification`

**Хайлтын tool-ийн шинэ гаралт** (жишээ):
```json
{ "summary": { "query": "99739959", "count": 12, "byStatus": {"ARRIVED":1,"PICKED_UP":11}, "totalValue": 36000, "names": ["Amgalan"] },
  "link": { "label": "Тайлангаас дэлгэрэнгүй харах", "href": "/admin/report?phone=99739959" } }
```
Route нь `link`-ийг барьж аваад frontend-д товч болгон харуулна. Товч дарахад тухайн хуудас автоматаар хайлт хийнэ.

## 5. Tool-calling loop (хоёул адил)

```
1. Эхний дуудлага: tool_choice='required' (заавал tool дуудуул)
2. Tool дуудвал → гүйцэтгээд үр дүнг буцаана
3. Tool гүйцэтгэсний дараа: tool_choice='none' (заавал текст хариулт албадах)
4. finish_reason='stop'|'length' → reply буцаана
5. ask_clarification дуудвал → {clarify, question, options} буцаана (товч харуулна)
```

## 6. Замд тохиолдсон асуудлууд (шийдсэн)

1. `gpt-5-mini` туршсан — tool-ийн дараа `content: null` буцаадаг, жагсаалт дамппддаг байсан → `gpt-4o-mini` руу сольсон + `tool_choice='none'` нэмсэн.
2. `max_tokens` → `gpt-5-mini` дэмждэггүй, `max_completion_tokens` хэрэглэсэн.
3. Admin AI ачаа хайхад 20 мөр текст хог гаргаж, удаан (12-14 сек), токен үрдэг байсан → одоо дүгнэлт + deep-link.
4. Hydration error (draggable widget) → mount хүртэл байрлалыг нуусан.

## 7. Одоогийн үнэлгээ / бодит байдал

- User AI: ажиллаж байгаа ч чанар тогтворгүй, заримдаа хэт ерөнхий.
- Admin AI: жагсаалт дампп зогссон, гэхдээ `gpt-4o-mini` нь Монгол хэлний нарийн ойлголт, tool сонголтод заримдаа алддаг.
- Хурд: tool + хариулт = 2 API дуудлага тул удаан (5-12 сек).
- Токен/зардлыг хэмнэх шаардлагатай (1000+ хэрэглэгч).

---

## 8. Fable 5-д асуух асуултууд (санал)

Дараах асуултуудаас сонгож, дээрх бүх context-ийн хамт асууна уу:

1. **Загварын сонголт**: 1000+ хэрэглэгчтэй, Монгол хэл дээрх карго туслахад `gpt-4o-mini` тохиромжтой юу? Чанар/зардал/хурдны хувьд ямар загвар (эсвэл Claude/бусад) илүү тохиромжтой вэ?

2. **Prompt engineering**: Дээрх system prompt-уудыг хэрхэн сайжруулах вэ? Tool сонголтыг найдвартай болгох, богино чанартай хариулт гаргах, Монгол хэлний чанарыг сайжруулах талаар тодорхой зөвлөгөө өгнө үү.

3. **Хурд/латенц**: 2 API дуудлага (tool → хариулт) удаан байна. Streaming, эсвэл tool-ийн үр дүнг шууд template-ээр форматлах (LLM-гүйгээр) зэрэг ямар арга байж болох вэ?

4. **Архитектур**: "Задлан шинжилгээ (admin) + яриа (user)" гэсэн үүргээр хуваасан хандлага зөв үү? Өөр илүү үр дүнтэй бүтэц байх уу (жишээ: intent classifier + template хариулт, RAG, эсвэл structured output)?

5. **Найдвартай байдал**: LLM tool сонголтод алддаг. Deterministic routing (түлхүүр үг → tool), эсвэл structured output/JSON mode ашиглах нь дээр үү?

6. **Хэрэглэгчийн туршлага**: Карго туслах AI-д ямар онцлог (feature) нэмбэл хамгийн их үнэ цэнэ өгөх вэ? (жишээ: ачаа ирэхэд идэвхтэй мэдэгдэх, төлбөр сануулах гэх мэт)

7. **Аюулгүй байдал/зардал**: Prompt injection, токен хэтрэлт, буруу мэдээлэл гаргахаас хэрхэн сэргийлэх вэ? Rate limit (admin 30, user 10/өдөр) зохистой юу?
