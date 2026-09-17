# Эрээний агуулах × Карго — Цахим гэрээний модуль (Төлөвлөгөө)

## 0. Зорилго

- Эрээний агуулахууд (жишээ нь: БНХАУ-ын "Наран тээвэр" ХХК / 内蒙古那仁货运代理有限公司) aicargo дээр бүртгэлтэй байна.
- Карго компани (ADMIN) агуулахын зураг, үйлчилгээ, үнийг үзээд **цахим гэрээ** байгуулна.
- Гэрээний төлбөр **1,200,000₮**. Төлбөр баталгаажмагц гэрээ идэвхжиж, агуулах тухайн каргод **тусгай хэсэг (байршил)** хуваарилж, ачаа хүлээн авах, ангилах, баглаж савлах ажлыг эхлүүлнэ.

### Шийдвэрлэсэн зүйлс
| Асуулт | Шийдвэр |
|---|---|
| Төлбөрийн төрөл | **Нэг удаагийн** 1,200,000₮. Жил бүр төлөхгүй. |
| Гэрээний хугацаа | **Байнгын** (хугацаагүй). Дуусах огноо, `EXPIRED` төлөв байхгүй. |
| Цуцлахад буцаах уу | **Буцаахгүй.** Гэрээнд тодорхой заана. |
| Мөнгө хаашаа орох | **Агуулахын данс руу шууд.** aicargo дамжихгүй, шимтгэлгүй. |
| Данс хэн тохируулах | **SUPER_ADMIN** агуулахын тохиргоонд оруулна. |
| Агуулахын талыг хэн удирдах | **SUPER_ADMIN.** Тусдаа `WAREHOUSE` role, агуулахын нэвтрэх эрх **үүсгэхгүй**. Төлбөр батлах, зай талбай хуваарилах, гэрээ батлах, галерей — бүгдийг super admin хийнэ. |
| Салбар | Эрээнд **нэг байршил**. Гэрээ бүрт агуулах **нэг хэсэг (зай талбай)** гаргаж өгнө. Салбарын түвшин хэрэггүй. |
| Хэл | Гэрээ **нэг баримт**: мөр/заалт бүрийн **монгол текстийн доор хятад орчуулга** байна. Хятад хувийг тусад нь гарын үсэг зуруулахгүй — нэг гарын үсэг хоёр хэлийг хамарна. |
| Барьцаа | **Байхгүй.** 4.7-ийн барьцааны заалтыг хасна. |
| Гарын үсэг | **Зөвхөн цахим.** Тамгатай цаасан хувь шаардлагагүй. |
| Зай талбай | Хэмжээ (м²) заахгүй. Зөвхөн хэсгийн код (A-12 гэх мэт). |
| aicargo эрх | Эрх (`paidUntil`) дууссан карго ч гэрээ байгуулж **болно** — шалгалт хийхгүй. |
| PDF | Super admin баталсны дараа (`ACTIVE`) **PDF татаж авах, хэвлэх** боломжтой. |

## 1. Одоо байгаа суурь (дахин ашиглана)

| Юу | Хаана | Тайлбар |
|---|---|---|
| `PartnerWarehouse` model | `prisma/schema.prisma` | Нэр, утас, wechat, хаяг, **ганц** зураг. Өргөтгөнө. |
| Агуулах CRUD | `app/super/warehouses`, `app/api/super/warehouses/route.ts` | Зөвхөн SUPER_ADMIN. |
| Landing дээрх агуулахын хэсэг | `app/MarketingLanding.tsx` (~375-р мөр) | Дэлгэрэнгүй хуудас руу холбоно. |
| Cloudinary upload | `lib/cloudinary.ts` → `uploadWarehouseImage` | 800×500 crop — галерейд crop-гүй хувилбар нэмнэ. |
| OTP (и-мэйл) | `Otp` model, `app/api/signup-cargo/request-otp` | Гэрээнд гарын үсэг зурахад дахин ашиглана. |
| Audit log | `lib/audit.ts`, `AdminAuditLog` | Каргогийн талын гэрээний үйлдлийг бүртгэнэ (агуулахынх `WarehouseLog`-д). |
| Cron | `app/api/cron` | Төлбөр хүлээгдсэн сануулга, 30 хоногийн цуцлалт. |
| `EREEN` role, `Batch` | `app/batch`, `app/api/batch` | Фаз 5-д ачааны урсгалтай холбоно. |

> Анхаар: `prisma/migrations`-д зөвхөн 2 migration байгаа ч схемд олон model нэмэгдсэн → `prisma db push` ашиглаж байгаа бололтой. Нэг аргыг сонгож мөрдөнө.

## 2. Оролцогчид, эрх

| Role | Эрх |
|---|---|
| `SUPER_ADMIN` | Агуулахын тохиргоо, данс, галерей, зай талбай, гэрээний загвар. Бүх гэрээг харах; **А тал (агуулах)-ыг төлөөлж** төлбөр батлах, зай талбай хуваарилах, гэрээ батлах, татгалзах, цуцлах. |
| `ADMIN` (карго) | Агуулах үзэх, гэрээ бөглөх, гарын үсэг зурах, төлбөрийн мэдээлэл харах, "Төлсөн" гэж мэдэгдэх, PDF татах, цуцлах хүсэлт. |

Шинэ role нэмэхгүй — `lib/auth.ts`, `proxy.ts`, `User` model өөрчлөгдөхгүй.

Tenant дүрэм: карго зөвхөн `cargoId = user.cargoId` гэрээгээ харна. Staff admin (`isStaffAdmin`) гэрээ байгуулах/цуцлах эрхгүй (зөвхөн харах).

## 3. Өгөгдлийн загвар (Prisma)

```prisma
model PartnerWarehouse {            // өргөтгөл
  // ...одоо байгаа талбарууд
  slug            String?  @unique      // /warehouses/[slug]
  legalNameMn     String?               // БНХАУлсын "Наран тээвэр" ХХК
  legalNameCn     String?               // 内蒙古那仁货运代理有限公司
  registerNo      String?               // 91152501MAK6XOACOX
  directorName    String?               // Тэрбиш овогтой Алтантуяа
  bankName        String?               // зөвхөн SUPER_ADMIN засна
  bankAccount     String?               // зөвхөн SUPER_ADMIN засна
  bankHolder      String?               // зөвхөн SUPER_ADMIN засна
  contractFee     Decimal  @default(1200000) @db.Decimal(12, 2) // нэг удаагийн, буцаагдахгүй
  services        String?               // жагсаалт/markdown
  pricePerTonCny  Decimal? @db.Decimal(12, 2)
  pricePerM3Cny   Decimal? @db.Decimal(12, 2)
  acceptingContracts Boolean @default(true)
  images          WarehouseImage[]
  sections        WarehouseSection[]
  templates       ContractTemplate[]
  contracts       WarehouseContract[]
}

model WarehouseImage {
  id          Int      @id @default(autoincrement())
  warehouseId Int
  warehouse   PartnerWarehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  url         String
  caption     String?
  category    String   @default("GENERAL") // EXTERIOR | INTERIOR | PACKING | LOADING | GENERAL
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  @@index([warehouseId, order])
}

model WarehouseSection {            // агуулахын доторх байршил (A-12 гэх мэт)
  id          Int      @id @default(autoincrement())
  warehouseId Int
  warehouse   PartnerWarehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  code        String              // "A-12"
  note        String?
  active      Boolean  @default(true)
  contracts   WarehouseContract[]
  @@unique([warehouseId, code])
}

model ContractTemplate {
  id          Int      @id @default(autoincrement())
  warehouseId Int
  warehouse   PartnerWarehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  version     Int
  titleMn     String              // АЧАА ТЭЭВЭРЛЭЛТ ТҮНШЛЭЛИЙН ГЭРЭЭ
  titleCn     String              // 货运合同
  body        String              // JSON: [{ "type": "heading"|"clause", "no": "2.1", "mn": "...{{x}}...", "cn": "...{{x}}..." }]
                                  // мөр бүр монгол + түүний доорх хятад хос
  fields      String              // JSON: бөглөх талбаруудын тодорхойлолт
  active      Boolean  @default(true)
  createdAt   DateTime @default(now())
  contracts   WarehouseContract[]
  @@unique([warehouseId, version])
}

model WarehouseContract {
  id            Int      @id @default(autoincrement())
  contractNo    String   @unique        // NT-2026-0001
  warehouseId   Int
  warehouse     PartnerWarehouse @relation(fields: [warehouseId], references: [id])
  cargoId       Int
  cargo         Cargo    @relation(fields: [cargoId], references: [id])
  templateId    Int
  template      ContractTemplate @relation(fields: [templateId], references: [id])
  values        String              // JSON: бөглөсөн утгууд
  renderedBody  String?             // гарын үсэг зурсан мөчийн хөлдөөсөн JSON (placeholder орлуулсан mn/cn хосууд)
  bodyHash      String?             // sha256(renderedBody) — өөрчлөгдөөгүйг батлах
  status        ContractStatus @default(DRAFT)
  fee           Decimal  @db.Decimal(12, 2) // гэрээ үүсэх үеийн contractFee-г хуулна
  payToBank     String?             // гарын үсэг зурах мөчийн агуулахын данс (дараа нь данс солигдсон ч хадгалагдана)
  payToAccount  String?
  payToHolder   String?
  paymentRef    String?             // гүйлгээний утга / QPay invoice id
  paidAt        DateTime?
  paymentConfirmedBy Int?
  cargoSignedAt   DateTime?
  cargoSignerName String?
  cargoSignerId   Int?
  cargoSignIp     String?
  approvedAt      DateTime?         // SUPER_ADMIN А талыг төлөөлж баталсан
  approvedByName  String?
  approvedById    Int?
  sectionId     Int?
  section       WarehouseSection? @relation(fields: [sectionId], references: [id], onDelete: SetNull)
  shippingMark  String?             // ачаан дээрх маркировка (3.2-р заалт)
  startDate     DateTime?           // хугацаагүй гэрээ — endDate байхгүй
  terminatedAt  DateTime?
  terminationRequestedAt DateTime?
  terminationRequestedBy String?    // CARGO | SUPER
  terminationReason      String?
  rejectReason  String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  events        ContractEvent[]
  @@index([cargoId, status])
  @@index([warehouseId, status])
}

model ContractEvent {
  id         Int      @id @default(autoincrement())
  contractId Int
  contract   WarehouseContract @relation(fields: [contractId], references: [id], onDelete: Cascade)
  actorId    Int?
  actorName  String
  action     String   // CREATED | SUBMITTED | SIGNED_CARGO | PAYMENT_CONFIRMED | SIGNED_WH | SECTION_ASSIGNED | TERMINATION_REQUESTED | TERMINATED | REJECTED
  detail     String?
  createdAt  DateTime @default(now())
  @@index([contractId, createdAt])
}

enum ContractStatus {
  DRAFT                 // карго бөглөж байна
  AWAITING_PAYMENT      // карго гарын үсэг зурсан, 1.2 сая хүлээж байна
  PAYMENT_REVIEW        // карго "төлсөн" гэж мэдэгдсэн, агуулах шалгана
  ACTIVE                // super admin төлбөр баталж, хэсэг хуваарилж, баталсан
  TERMINATION_PENDING   // 30 хоногийн мэдэгдэл явж байна (6.2, 6.3)
  TERMINATED            // төлбөр буцаагдахгүй
  REJECTED              // агуулах төлбөр хүлээн аваагүй/татгалзсан
}
```

Мөн: `NotifType`-д `CONTRACT`, `Cargo`-д `contracts WarehouseContract[]`.

```prisma
model WarehouseLog {               // агуулахын тохиргооны өөрчлөлт (ялангуяа данс) — AdminAuditLog нь cargoId шаарддаг тул тусдаа
  id          Int      @id @default(autoincrement())
  warehouseId Int
  warehouse   PartnerWarehouse @relation(fields: [warehouseId], references: [id], onDelete: Cascade)
  userId      Int
  userName    String
  action      String   // BANK_CHANGED | FEE_CHANGED | ...
  detail      String?
  createdAt   DateTime @default(now())
  @@index([warehouseId, createdAt])
}
```

## 4. Гэрээний төлөвийн урсгал

```
DRAFT ──(карго гарын үсэг + OTP)──▶ AWAITING_PAYMENT ──(карго "төлсөн")──▶ PAYMENT_REVIEW
                                                                             │
             REJECTED ◀──(super татгалзсан)───────────────────────────────────┤
                                                                             ▼
                              (super: төлбөр батлах + хэсэг хуваарилах + батлах)       
                                                                             ▼
                           ACTIVE (хугацаагүй) ──(аль нэг тал цуцлах хүсэлт)──▶ TERMINATION_PENDING ──(30 хоног)──▶ TERMINATED
```

Дүрэм:
- Нэг карго × нэг агуулах хооронд зэрэг зөвхөн нэг `ACTIVE`/хүлээгдэж буй гэрээ.
- Карго гарын үсэг зурсны дараа `values`, `renderedBody` өөрчлөгдөхгүй (засвар = шинэ гэрээ эсвэл нэмэлт гэрээ, 7.3).
- Загвар шинэчлэгдэхэд хуучин гэрээ хуучин `templateId`-гаа хадгална.
- Нэг гэрээнд нэг хэсэг. Гэрээ `TERMINATED` болоход хэсэг чөлөөлөгдөнө. Төлбөр буцаах урсгал байхгүй.
- Дахин гэрээ байгуулбал шинээр 1.2 сая₮ төлнө.

## 5. Хуудас ба API

### 5.1 Нийтийн (нэвтрэхгүй)
- `app/warehouses/page.tsx` — агуулахын жагсаалт (карт, гол зураг, хаяг, үнэ).
- `app/warehouses/[slug]/page.tsx` — **зургийн галерей** (ангиллаар шүүх, lightbox, гүйлгэх), үйлчилгээ, тариф, байршил, "Гэрээ байгуулах" товч → нэвтрээгүй бол `/login` / `/signup-cargo`.
- `MarketingLanding.tsx`-ийн агуулахын картыг дэлгэрэнгүй хуудас руу холбох.
- `api/warehouses`, `api/warehouses/[slug]` — зөвхөн `active` агуулах, банкны мэдээлэлгүй.

### 5.2 Карго ADMIN (`app/admin/warehouse/...`)
- `page.tsx` — миний гэрээнүүд (төлөв, хэсэг, маркировка, дуусах огноо) + "Шинэ гэрээ".
- `new/[warehouseId]/page.tsx` — **4 алхамт wizard**:
  1. Агуулахтай танилцах (галерей, нөхцөл)
  2. Мэдээлэл бөглөх — `Cargo`-оос урьдчилж бөглөнө: каргоны нэр, регистр №, төлөөлөгчийн овог нэр, хаяг (дүүрэг/хороо/тоот), УБ-д буулгах хаяг (4.4), утас
  3. Гэрээг бүтнээр нь урьдчилан харах (бөглөсөн утгууд тодруулж)
  4. "Танилцаж, зөвшөөрч байна" checkbox + нэрээ бичих + и-мэйлийн OTP → гарын үсэг
- Урьдчилан харах, гэрээ харах хуудсанд заалт бүр монгол текст, **доор нь** хятад орчуулга (жижиг, саарал өнгөөр) харагдана — PDF-тэй ижил дүр төрх.
- `[id]/page.tsx` — гэрээ харах, **PDF татах/хэвлэх (зөвхөн `ACTIVE` болсны дараа, түүнээс өмнө товч идэвхгүй)**, төлбөрийн заавар (агуулахын данс, дүн 1,200,000₮, гүйлгээний утга = `contractNo`, "нэг удаагийн, буцаагдахгүй" анхааруулга), "Төлсөн" товч (баримтын зураг хавсаргах), цуцлах хүсэлт.
- API: `api/admin/warehouse-contracts` (GET, POST draft), `[id]` (GET, PATCH draft), `[id]/sign`, `[id]/payment-claim`, `[id]/terminate`.
- `AdminNav.tsx`-д "Эрээний агуулах" цэс.

### 5.3 SUPER_ADMIN (агуулахын талыг бүхэлд нь удирдана)
- `app/super/warehouses/[id]` — **агуулахын тохиргоо** ✅ (фаз 1): хуулийн нэр (МН/中文), регистр, захирал, **банк, данс, эзэмшигч**, гэрээний төлбөр, тариф, үйлчилгээ, галерей. Данс/төлбөр солиход `WarehouseLog`-д бичнэ.
- `app/super/warehouses/[id]/sections` — зай талбайн (хэсгийн код) жагсаалт, аль нь аль каргод оногдсон.
- `app/super/warehouses/[id]/template` — гэрээний загвар засах: заалт бүрт монгол мөр + доор нь хятад мөр оруулна (нэмэх, устгах, эрэмбэлэх), placeholder хоёуланд таарч байгааг шалгана, хувилбар хөтөлнө.
- `app/super/contracts` — бүх гэрээ, төлөвөөр шүүх, "Төлбөр шалгах" төлөвтэйг дээр нь харуулах (тоолуур `SuperNav`-д).
- `app/super/contracts/[id]` — гэрээ харах, карго хавсаргасан баримт харах, **төлбөр батлах**, **хэсэг сонгох**, маркировка үүсгэх, **батлах** (OTP), татгалзах (шалтгаан), цуцлах, PDF татах.
- API: `api/super/warehouse-contracts` (GET), `[id]` (GET), `[id]/approve`, `[id]/reject`, `[id]/terminate`, `[id]/pdf`; `api/super/warehouses/[id]/sections`.

## 6. Гэрээний загвар (draft-аас)

Хавсаргасан 3 хуудас draft-ийг `ContractTemplate.body` болгоно: заалт бүр `{ no, mn, cn }` хос. Хятад орчуулга нь тусдаа баримт биш, монгол мөр бүрийн доор байрлана; гарын үсэг нэг л удаа зурагдаж хоёуланг хамарна. Хоёр хэлний аль нь давуу хүчинтэйг гэрээнд заана (санал: монгол). Placeholder нь `mn`, `cn` хоёуланд ижил байна. Placeholder-ууд:

| Placeholder | Хаанаас |
|---|---|
| `{{contractNo}}`, `{{signDate}}` | систем |
| `{{cargoName}}`, `{{cargoRegisterNo}}` | карго бөглөнө (Cargo-оос урьдчилсан) |
| `{{repLastName}}`, `{{repFirstName}}`, `{{repPosition}}`, `{{repPhone}}` | карго бөглөнө |
| `{{cargoDistrict}}`, `{{cargoKhoroo}}`, `{{cargoAddress}}` | карго бөглөнө |
| `{{destination}}` (1.2), `{{ubUnloadAddress}}` (4.4) | карго бөглөнө |
| `{{pricePerTonCny}}` (2.3), `{{pricePerKgMnt}}` (2.4), `{{pricePerM3Cny}}` (2.5) | агуулахын тариф |
| `{{contractFee}}`, `{{contractFeeWords}}` | агуулахын тохиргоо (1,200,000₮) |
| `{{bankName}}`, `{{bankAccount}}`, `{{bankHolder}}` | агуулахын тохиргоо (SUPER_ADMIN) — 4.7-д "Хаан банк 5925056082" гэж хатуу бичсэнийг орлоно |
| `{{sectionCode}}`, `{{shippingMark}}` | идэвхжих үед агуулах |

Тоог үгээр бичих (`1,200,000` → "нэг сая хоёр зуун мянга") жижиг helper: `lib/mn-number-words.ts`.

### Draft-д засах шаардлагатай зүйлс (хуульчтай нягтлах)
1. **1.2 сая₮-ийн гэрээний төлбөр** гэрээнд огт тусгагдаагүй → "Хоёр. Үнэ, төлбөр"-т шинэ заалт нэмэх: "Б тал гэрээ байгуулахдаа А талын дансанд нэг удаагийн {{contractFee}} төгрөг төлнө. Энэ төлбөр гэрээ аль ч талын санаачилгаар цуцлагдсан тохиолдолд буцаан олгогдохгүй."
2. **Агуулахад хэсэг хуваарилах, баглаа боодлын үйлчилгээ** тусгагдаагүй → А талын үүрэгт нэмэх: "Эрээн хот дахь агуулахдаа Б талд зориулсан зай талбай гаргаж өгнө."
3. **7.2 Гэрээний хугацаа "3 жил"** → "Гэрээ хугацаагүй бөгөөд 6-р зүйлд заасны дагуу цуцлах хүртэл хүчинтэй" болгох.
4. **Цахим хэлбэрээр байгуулах, цахим гарын үсгийн хүчин төгөлдөр байдал**-ын заалт нэмэх (7.1 одоо "гарын үсэг зурж, тамга дарснаар" гэсэн).
5. **Хэлний заалт** нэмэх: "Гэрээ монгол, хятад хэлээр үйлдэгдсэн, зөрүү гарвал монгол хувийг баримтална."
6. 4.7-д данс ("Хаан банк 5925056082") хатуу бичигдсэн → placeholder болгох.
7. 3.4 "Гэрээний 3 дугаар зүйлд заасан журмаар" → төлбөрийн журам 2-р зүйлд байна.
8. 7.5 "хоёр хувь (2%)", "А тал 2, Б тал 1" — зөрүүтэй; цахим хувилбарт "талууд цахим хувийг татаж авна" болгох.
9. 6.1–6.2 "Гүйцэтгэгч / захиалагч" гэсэн тодорхойлогдоогүй нэр томьёо → "А тал / Б тал".
10. Гарчигт "Улаанбаатар хот" гэж байгаа ч А тал Эрээнд — гэрээ байгуулсан газрыг "цахимаар" гэж тэмдэглэх.
11. 4.7-ийн барьцааны өгүүлбэрийг ("Харилцагчийн барьцаалбар ... төг") **хасах**.
12. 7.1 "гарын үсэг зурж, тамга дарснаар" → "цахимаар баталгаажуулж, А тал баталснаар хүчин төгөлдөр болно".

## 7. Цахим гарын үсэг ба PDF

- **Зөвхөн цахим гарын үсэг** (цаасан, тамгатай хувь шаардахгүй):
  - Карго: зөвшөөрлийн checkbox + бүтэн нэр + и-мэйл OTP.
  - А тал: super admin агуулахыг төлөөлж төлбөр баталгаажуулж, хэсэг хуваарилаад "Батлах" дарна (мөн OTP). PDF-д "А талыг төлөөлж: {агуулахын захирал} (aicargo-оор баталгаажуулсан)" гэж гарна.
  - Хоёр талын нэр, огноо, IP, хэрэглэгчийн ID, `bodyHash` (sha256) хадгална.
- **PDF зөвхөн `ACTIVE` гэрээнд:**
  - API: `GET /api/admin/warehouse-contracts/[id]/pdf`, `GET /api/super/warehouse-contracts/[id]/pdf`. `ACTIVE`/`TERMINATION_PENDING`/`TERMINATED` биш бол 403.
  - Серверт `@react-pdf/renderer`-ээр үүсгэнэ, Noto Sans (кирилл) + Noto Sans SC (хятад) фонтыг embed хийнэ (хятад фонт том тул subset хийх эсвэл `public/fonts`-оос ачаална).
  - Бүтэц: гарчиг (МН, доор нь 中文) → заалт бүр **монгол мөр, доор нь хятад мөр** → талуудын мэдээлэл → **"Цахимаар баталгаажуулсан / 电子签署确认"** блок (хоёр талын нэр, огноо, гэрээний №, hash-ийн эхний 12 тэмдэгт) → QR код (гэрээний баталгаажуулах хуудас руу).
  - `renderedBody`-оос үүсгэдэг тул хэдэн удаа татсан ч агуулга ижил.
  - Хэвлэх: PDF-ийг браузерт нээж хэвлэнэ (тусдаа print хуудас хэрэггүй).
- **Баталгаажуулах хуудас** (заавал биш): `/contracts/verify/[contractNo]` — гэрээ хүчинтэй эсэх, талуудын нэр, огноо (агуулгагүй).
- Эрсдэл: цахим гэрээний хүчин төгөлдөр байдлыг хуульчаар нэг удаа нягтлуулах.

## 8. Төлбөр (1,200,000₮, нэг удаагийн, буцаагдахгүй)

- Мөнгө **агуулахын данс руу шууд** орно. aicargo мөнгө дамжуулахгүй тул super admin агуулахаас орлого орсныг лавлаж (эсвэл дансны хуулга харж) баталгаажуулна.
- Данс: SUPER_ADMIN `app/super/warehouses/[id]`-д тохируулна. Карго гарын үсэг зурах мөчид `payToBank/payToAccount/payToHolder`-т хуулж хадгална — дараа нь данс солигдсон ч тухайн гэрээ зөв дансаа харуулна.
- **Урсгал:** данс + дүн + гүйлгээний утга `contractNo` харуулна → карго "Төлсөн" дарж баримтын зураг хавсаргана → **SUPER_ADMIN** "Төлбөр орсон" гэж баталгаажуулна.
- Гарын үсэг зурахын өмнө болон төлбөрийн хуудсанд "Энэ төлбөр нэг удаагийн бөгөөд гэрээ цуцлагдсан ч буцаагдахгүй" анхааруулга, checkbox.
- Ирээдүйд: агуулах өөрийн QPay merchant-тай бол invoice-ийг агуулахын merchant-аар үүсгэж автомат батлах (webhook гарын үсэг шалгах, idempotent).

## 9. Мэдэгдэл, cron

- `Notification` (`CONTRACT` type): гарын үсэг зурагдсан, төлбөр хүлээгдэж байна, идэвхжсэн, цуцлах хүсэлт.
- И-мэйл (`lib/mail.ts`): super admin-д шинэ гэрээ ирсэн / төлсөн гэж мэдэгдсэн; каргод идэвхжсэн (хэсэг, маркировкатай) эсвэл татгалзсан.
- Агуулах руу мэдээлэл (шинэ гэрээ, хэсэг) super admin гараар (WeChat/утас) дамжуулна — агуулах системд нэвтрэхгүй.
- `app/api/cron`: `AWAITING_PAYMENT` 7 хоногоос дээш → сануулга, 30 хоног → `REJECTED`; `TERMINATION_PENDING` 30 хоног → `TERMINATED` + хэсгийг чөлөөлөх. (Гэрээ хугацаагүй тул дуусах сануулга байхгүй.)

## 10. Үе шат

**Явц:** Фаз 1 ✅ (`scripts/add-warehouse-profile-gallery.ts`), Фаз 2 ✅ (`scripts/add-warehouse-sections-log.ts`) — хоёр скрипт Supabase дээр ажилласан; production deploy-оос өмнө DB-д байгаа эсэхийг шалгана. Дараагийнх: Фаз 3.

| Фаз | Агуулга | Үр дүн |
|---|---|---|
| **1. Агуулахын тохиргоо + галерей** | Schema өргөтгөл (хуулийн мэдээлэл, данс, төлбөр), `WarehouseImage`, олон зураг upload, super-ийн агуулахын тохиргоо хуудас, `/warehouses`, `/warehouses/[slug]`, landing холбоос | Каргонууд агуулахыг зурагтай нь үзнэ, данс тохируулагдана |
| **2. Зай талбай + лог** | `WarehouseSection` CRUD (`/super/warehouses/[id]/sections`), `WarehouseLog` (данс/төлбөр солисон түүх) | Super admin зай талбайг бүртгэж, өөрчлөлтийг хянана |
| **3. Цахим гэрээ** | Хоёр хэлтэй template, Contract, Event, wizard, OTP гарын үсэг, хоёр хэлтэй **PDF (ACTIVE-ийн дараа)**, super admin төлбөр батлах, хэсэг хуваарилах, цуцлалт, мэдэгдэл, cron | Эхний бодит гэрээ байгуулагдана |
| **4. Сайжруулалт** | Баталгаажуулах хуудас (QR), загварын хувилбар засагч, QPay (агуулахын merchant) | Гар ажиллагаа багасна |
| **5. Үйл ажиллагааны холбоос** | Super admin (эсвэл карго өөрөө) гэрээт каргын ачааг `EREEN_ARRIVED` болгох / `Batch` үүсгэх, хэсэг тус бүрийн ачааны тоо, баглаа боодлын тэмдэглэл + зураг | Агуулах ↔ карго ачааны мэдээлэл нэг системд |

## 11. Шалгах зүйлс

- Tenant тусгаарлалт: карго A нь карго B-ийн гэрээг `id` солиод авч чадахгүй.
- Агуулахын тохиргоо, гэрээ батлах API-ууд SUPER_ADMIN-аас бусдад 403.
- Staff admin гэрээ байгуулах/цуцлах гэвэл 403.
- Гарын үсэг зурсны дараа `PATCH` хийхэд 409.
- Данс солигдсоны дараа хуучин гэрээ хуучин дансаа харуулна.
- Нэг карго-агуулах хооронд давхар идэвхтэй гэрээ үүсэхгүй (transaction дотор шалгах).
- Нэг хэсэг хоёр идэвхтэй гэрээнд оногдохгүй; цуцлагдахад чөлөөлөгдөнө.
- Аль нэг заалтын `mn`, `cn` дахь placeholder-ууд таарахгүй эсвэл хятад мөр хоосон бол загвар хадгалагдахгүй.
- Кирилл + Хятад текст PDF-д зөв гарах.
- `ACTIVE` болохоос өмнө PDF endpoint 403 буцаана; өөр каргын гэрээний PDF татаж чадахгүй.

## 12. Үлдсэн асуултууд

Бүх үндсэн асуулт шийдэгдсэн. Хэрэгжүүлэхийн өмнө бэлдэх зүйл:
- Draft-ийн засварласан монгол текст + мөр бүрийн хятад орчуулга (агуулах талаас).
- Цахим гэрээний хүчин төгөлдөр байдлыг хуульчаар нэг удаа нягтлуулах.
