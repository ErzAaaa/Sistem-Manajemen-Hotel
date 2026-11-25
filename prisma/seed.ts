import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // Create default property
  await prisma.property.upsert({
    where: { id: 'default-property' },
    update: {},
    create: {
      id: 'default-property',
      nama: 'Hotel Nusantara',
      alamat: 'Jl. Merdeka No. 1',
      kota: 'Jakarta',
      provinsi: 'DKI Jakarta',
      zonaWaktu: 'Asia/Jakarta',
      jamCheckIn: '14:00',
      jamCheckOut: '12:00',
      cutOffHariBisnis: '06:00',
      mataUang: 'IDR',
    },
  })

  // Create default tax config
  await prisma.taxConfig.upsert({
    where: { id: 'default-tax' },
    update: {},
    create: {
      id: 'default-tax',
      pajakDaerahPct: 10.0,
      serviceChargePct: 10.0,
      modeHarga: 'EXCLUSIVE',
      aktif: true,
    },
  })

  // Create default users
  const passwordHash = await bcrypt.hash('admin123', 12)

  await prisma.user.upsert({
    where: { username: 'owner' },
    update: {},
    create: {
      username: 'owner',
      email: 'owner@hotel.com',
      passwordHash,
      nama: 'Pemilik Hotel',
      role: 'OWNER',
    },
  })

  await prisma.user.upsert({
    where: { username: 'manajer' },
    update: {},
    create: {
      username: 'manajer',
      email: 'manajer@hotel.com',
      passwordHash,
      nama: 'Manajer Hotel',
      role: 'MANAJER',
    },
  })

  await prisma.user.upsert({
    where: { username: 'resepsionis' },
    update: {},
    create: {
      username: 'resepsionis',
      email: 'resepsionis@hotel.com',
      passwordHash,
      nama: 'Resepsionis',
      role: 'RESEPSIONIS',
    },
  })

  await prisma.user.upsert({
    where: { username: 'keuangan' },
    update: {},
    create: {
      username: 'keuangan',
      email: 'keuangan@hotel.com',
      passwordHash,
      nama: 'Admin Keuangan',
      role: 'ADMIN_KEUANGAN',
    },
  })

  // Create room types
  const standard = await prisma.roomType.upsert({
    where: { id: 'rt-standard' },
    update: {},
    create: {
      id: 'rt-standard',
      nama: 'Standard',
      kapasitas: 2,
      fasilitas: JSON.stringify(['AC', 'TV', 'WiFi', 'Kamar Mandi Dalam']),
      deskripsi: 'Kamar standar dengan fasilitas lengkap',
    },
  })

  const deluxe = await prisma.roomType.upsert({
    where: { id: 'rt-deluxe' },
    update: {},
    create: {
      id: 'rt-deluxe',
      nama: 'Deluxe',
      kapasitas: 2,
      fasilitas: JSON.stringify(['AC', 'TV', 'WiFi', 'Kamar Mandi Dalam', 'Kulkas', 'Balkon']),
      deskripsi: 'Kamar deluxe dengan balkon dan pemandangan',
    },
  })

  const suite = await prisma.roomType.upsert({
    where: { id: 'rt-suite' },
    update: {},
    create: {
      id: 'rt-suite',
      nama: 'Suite',
      kapasitas: 4,
      fasilitas: JSON.stringify(['AC', 'TV', 'WiFi', 'Kamar Mandi Dalam', 'Kulkas', 'Balkon', 'Ruang Tamu', 'Bathtub']),
      deskripsi: 'Suite mewah dengan ruang tamu terpisah',
    },
  })

  // Create rooms
  const rooms = [
    { nomor: '101', lantai: 1, roomTypeId: standard.id },
    { nomor: '102', lantai: 1, roomTypeId: standard.id },
    { nomor: '103', lantai: 1, roomTypeId: standard.id },
    { nomor: '104', lantai: 1, roomTypeId: standard.id },
    { nomor: '105', lantai: 1, roomTypeId: standard.id },
    { nomor: '201', lantai: 2, roomTypeId: deluxe.id },
    { nomor: '202', lantai: 2, roomTypeId: deluxe.id },
    { nomor: '203', lantai: 2, roomTypeId: deluxe.id },
    { nomor: '204', lantai: 2, roomTypeId: deluxe.id },
    { nomor: '301', lantai: 3, roomTypeId: suite.id },
    { nomor: '302', lantai: 3, roomTypeId: suite.id },
  ]

  for (const room of rooms) {
    await prisma.room.upsert({
      where: { nomor: room.nomor },
      update: {},
      create: room,
    })
  }

  // Create rate plans
  await prisma.ratePlan.upsert({
    where: { id: 'rp-std-umum' },
    update: {},
    create: {
      id: 'rp-std-umum',
      nama: 'Standard - Tarif Umum',
      roomTypeId: standard.id,
      tarifDasar: 350000,
      sumber: 'UMUM',
      inklusi: JSON.stringify(['Sarapan']),
    },
  })

  await prisma.ratePlan.upsert({
    where: { id: 'rp-dlx-umum' },
    update: {},
    create: {
      id: 'rp-dlx-umum',
      nama: 'Deluxe - Tarif Umum',
      roomTypeId: deluxe.id,
      tarifDasar: 550000,
      sumber: 'UMUM',
      inklusi: JSON.stringify(['Sarapan', 'Welcome Drink']),
    },
  })

  await prisma.ratePlan.upsert({
    where: { id: 'rp-ste-umum' },
    update: {},
    create: {
      id: 'rp-ste-umum',
      nama: 'Suite - Tarif Umum',
      roomTypeId: suite.id,
      tarifDasar: 1200000,
      sumber: 'UMUM',
      inklusi: JSON.stringify(['Sarapan', 'Welcome Drink', 'Afternoon Tea']),
    },
  })

  await prisma.ratePlan.upsert({
    where: { id: 'rp-std-ota' },
    update: {},
    create: {
      id: 'rp-std-ota',
      nama: 'Standard - OTA',
      roomTypeId: standard.id,
      tarifDasar: 400000,
      sumber: 'OTA',
      inklusi: JSON.stringify(['Sarapan']),
    },
  })

  // Create expense categories (USALI-based)
  const categories = [
    { id: 'ec-gaji', nama: 'Gaji dan Tunjangan', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'A&G' },
    { id: 'ec-listrik', nama: 'Listrik, Air, Internet', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'UTIL' },
    { id: 'ec-laundry', nama: 'Laundry dan Linen', departemen: 'KAMAR', kodeUsali: 'ROOMS' },
    { id: 'ec-amenities', nama: 'Amenities & Housekeeping', departemen: 'KAMAR', kodeUsali: 'ROOMS' },
    { id: 'ec-fnb', nama: 'Bahan F&B', departemen: 'FNB', kodeUsali: 'F&B' },
    { id: 'ec-maintenance', nama: 'Perbaikan & Pemeliharaan', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'POM' },
    { id: 'ec-komisi-ota', nama: 'Komisi OTA', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'S&M' },
    { id: 'ec-pemasaran', nama: 'Pemasaran', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'S&M' },
    { id: 'ec-admin', nama: 'Administrasi & Perizinan', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'A&G' },
    { id: 'ec-pajak', nama: 'Pajak & Asuransi', departemen: 'TETAP', kodeUsali: 'FIXED' },
    { id: 'ec-sewa', nama: 'Sewa', departemen: 'TETAP', kodeUsali: 'FIXED' },
    { id: 'ec-lainnya', nama: 'Lain-lain', departemen: 'TAK_TERDISTRIBUSI', kodeUsali: 'OTHER' },
  ]

  for (const cat of categories) {
    await prisma.expenseCategory.upsert({
      where: { id: cat.id },
      update: {},
      create: cat,
    })
  }

  console.log('Seeding complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
