/**
 * เว็บแอพสืบสวนติดตามและขยายผล
 * ข้อมูลตัวอย่างจากไทม์ไลน์ภายในหน่วย คดี 162,000 เม็ด
 * seedSample() เขียนลงสเปรดชีตใหม่เท่านั้น ไม่แตะแดชบอร์ดเดิม
 */
var SampleData = (function () {
  'use strict';

  var NOW = '2026-10-31T09:00:00+07:00';

  var users = [
    { id: 'u-commander', name: 'ผู้บังคับกองร้อย', role: 'boss', active: '1' },
    { id: 'u-chief', name: 'หัวหน้าชุดปฏิบัติการข่าว', role: 'boss', active: '1' },
    { id: 'u-officer', name: 'สมาชิกชุดปฏิบัติการข่าว', role: 'officer', active: '1' },
    { id: 'u-inquiry', name: 'พนักงานสอบสวนประสาน', role: 'officer', active: '1' }
  ];

  var placeholderUserIds = ['u-commander', 'u-chief', 'u-officer', 'u-inquiry', 'u-thoedsak'];

  var roster = [
    { id: 'u-surriya', name: 'ร.ต.อ.สุริยา วรรณพฤกษ์', role: 'boss', active: '1' },
    { id: 'u-sittichai', name: 'ด.ต.สิทธิชัย วงศ์ธรรม', role: 'officer', active: '1' },
    { id: 'u-amarin', name: 'ส.ต.อ.อัมรินทร์ พรมเมืองขวา', role: 'officer', active: '1' },
    { id: 'u-kanasawat', name: 'ด.ต.คณาสวัสดิ์ อาจวิชัย', role: 'officer', active: '1' },
    { id: 'u-rapeerat', name: 'จ.ส.ต.รพีรัฐ ปัดเกษม', role: 'officer', active: '1' },
    { id: 'u-atchariya', name: 'จ.ส.ต.อัจฉะริยะ จักรเรืองชัย', role: 'officer', active: '1' },
    { id: 'u-aniwat', name: 'ส.ต.อ.อนิวัฒน์ พลตื้อ', role: 'officer', active: '1' },
    { id: 'u-chittiwat', name: 'ส.ต.อ.จิตรทิวัส แก้วหลวง', role: 'officer', active: '1' },
    { id: 'u-nattawut', name: 'จ.ส.ต.ณัฐวุฒิ บุตรโส', role: 'officer', active: '1' }
  ];

  var cases = [
    {
      id: 'case-162000',
      name: 'คดียาบ้า 162,000 เม็ด',
      detail: 'ตรวจยึดยาเสพติดให้โทษประเภท 1 (ยาบ้า) จำนวน 162,000 เม็ด และจับกุมผู้ต้องหา 2 ราย ชุดปฏิบัติการข่าวกองร้อยตำรวจตระเวนชายแดนที่ 244 บูรณาการร่วม บก.ควบคุมที่ 2 (ร.13) กกล.สุรศักดิ์มนตรี เคสนี้ยังเปิดเพื่อติดตามเครือข่ายที่ยังไม่ถูกจับกุม',
      status: 'open',
      nextStep: 'สืบติดตามที่อยู่อาศัยและพฤติกรรมของนายจักรพงษ์ พานเหนือ ในพื้นที่ จ.บึงกาฬ และเป้าหมายเครือข่ายปลายทางใน จ.สกลนคร พร้อมรวบรวมพยานหลักฐานความเชื่อมโยงทางการสื่อสารและเส้นทางการเงิน เพื่อขออนุมัติออกหมายจับ',
      arrestRecordUrl: '',
      createdAt: '2026-02-13T09:00:00+07:00',
      createdById: 'u-chief',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว',
      closedAt: '',
      driveFolderId: ''
    },
    {
      id: 'case-laos-caller',
      name: 'ขยายผลผู้สั่งการ สปป.ลาว',
      detail: 'ผู้สั่งการจากฝั่ง สปป.ลาว ที่ติดต่อผ่าน LINE / Facebook ด้วยหมายเลข +69711984037116 ยังพิสูจน์ทราบตัวบุคคลไม่ได้',
      status: 'open',
      nextStep: 'ประสานขอข้อมูลหมายเลข +69711984037116 และเส้นทางเชื่อมไป อ.บ้านม่วง จ.สกลนคร',
      arrestRecordUrl: '',
      createdAt: '2026-03-20T10:00:00+07:00',
      createdById: 'u-officer',
      createdByName: 'สมาชิกชุดปฏิบัติการข่าว',
      closedAt: '',
      driveFolderId: ''
    },
    {
      id: 'case-closed-7925',
      name: 'จับกุมผู้ลำเลียงรถเก๋ง กข 7925',
      detail: 'เคสจับกุมผู้ลำเลียงที่ปิดแล้วเมื่อ 13 ก.พ. 69 ของกลางและเครือข่ายที่เหลือไปติดตามในคดียาบ้า 162,000 เม็ด',
      status: 'closed',
      nextStep: '',
      arrestRecordUrl: '',
      createdAt: '2026-02-13T09:00:00+07:00',
      createdById: 'u-chief',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว',
      closedAt: '2026-02-13T21:00:00+07:00',
      driveFolderId: ''
    }
  ];

  var entries = [
    {
      id: 'e-162-1',
      caseId: 'case-162000',
      entryDate: '2026-02-13',
      eventTime: '09:00',
      text: 'ได้รับแจ้งจากสายลับว่าจะมีการลักลอบลำเลียงยาเสพติด โดยใช้รถยนต์เก๋งฮอนด้าซีวิค สีขาว ทะเบียน กข 7925 ขอนแก่น ขนลำเลียงผ่านทางหลวงหมายเลข 222 (พังโคน - บึงกาฬ) โดยเข้ามาทางพื้นที่ อ.เซกา จ.บึงกาฬ',
      stage: 1,
      phones: '',
      plates: 'กข 7925 ขอนแก่น',
      people: '',
      photoIds: '',
      photoFiles: [],
      authorId: 'u-chief',
      authorName: 'หัวหน้าชุดปฏิบัติการข่าว',
      createdAt: '2026-02-13T09:20:00+07:00'
    },
    {
      id: 'e-162-2',
      caseId: 'case-162000',
      entryDate: '2026-02-13',
      eventTime: '19:00',
      text: 'สกัดจับกุมผู้ต้องหา 2 ราย คือ นายกิตติศักดิ์ โนนริบูรณ์ และ นายวรายุทธ ทิพย์นนท์ พร้อมของกลางยาเสพติดให้โทษประเภท 1 (ยาบ้า) จำนวน 162,000 เม็ด และตรวจยึดรถยนต์เก๋งฮอนด้าซีวิค สีขาว หมายเลขทะเบียน กข 7925 ขอนแก่น จำนวน 1 คัน นำส่งพนักงานสอบสวน เคสขยายผลเครือข่ายยังไม่ปิด',
      stage: 1,
      phones: '',
      plates: 'กข 7925 ขอนแก่น',
      people: 'นายกิตติศักดิ์ โนนริบูรณ์, นายวรายุทธ ทิพย์นนท์',
      photoIds: '',
      photoFiles: ['evidence-scene.jpg', 'evidence-detail.jpg'],
      authorId: 'u-chief',
      authorName: 'หัวหน้าชุดปฏิบัติการข่าว',
      createdAt: '2026-02-13T21:10:00+07:00'
    },
    {
      id: 'e-162-3',
      caseId: 'case-162000',
      entryDate: '2026-03-15',
      eventTime: '',
      text: 'ขยายผลจากโทรศัพท์ของผู้ต้องหาทั้ง 2 ราย พบผู้สั่งการจากฝั่ง สปป.ลาว ใช้หมายเลข +69711984037116 ติดต่อผ่าน LINE / Facebook จุดปลายทางของยาบ้าล็อตนี้อยู่ที่ อ.บ้านม่วง จ.สกลนคร และพบเบอร์มือถือที่รับยาบ้าในพื้นที่ จ.บึงกาฬ 5 หมายเลข บันทึกตามไทม์ไลน์เดือนมีนาคม 2569',
      stage: 2,
      phones: '+69711984037116, 085-5019406, 095-2183065, 065-4904808, 092-9962820, 092-2858814',
      plates: '',
      people: '',
      photoIds: '',
      photoFiles: [],
      authorId: 'u-officer',
      authorName: 'สมาชิกชุดปฏิบัติการข่าว',
      createdAt: '2026-03-15T18:00:00+07:00'
    },
    {
      id: 'e-162-4',
      caseId: 'case-162000',
      entryDate: '2026-10-27',
      eventTime: '',
      text: 'ตรวจจุดต้นทางรับมอบยาบ้าที่บ้านเหล่าหมากฝาง ตำบลท่าดอกคำ อำเภอบึงโขงหลง จังหวัดบึงกาฬ พบว่าเบอร์ 092-9962820 มีชื่อผู้ครอบครองคือ นายจักรพงษ์ พานเหนือ ภูมิลำเนาอำเภอเมืองบึงกาฬ อยู่ระหว่างสืบติดตามที่อยู่อาศัยและเฝ้าติดตามพฤติกรรม พร้อมตรวจทะเบียนราษฎรเป้าหมายเชื่อมโยงใน จ.สกลนคร คือ นายรุ่งอรุณ คำภู และ นายจำรัส ล้วนวิเศษ',
      stage: 3,
      phones: '092-9962820',
      plates: '',
      people: 'นายจักรพงษ์ พานเหนือ, นายรุ่งอรุณ คำภู, นายจำรัส ล้วนวิเศษ',
      photoIds: '',
      photoFiles: [],
      authorId: 'u-chief',
      authorName: 'หัวหน้าชุดปฏิบัติการข่าว',
      createdAt: '2026-10-27T16:40:00+07:00'
    },
    {
      id: 'e-laos-1',
      caseId: 'case-laos-caller',
      entryDate: '2026-10-10',
      eventTime: '',
      text: 'ยังพิสูจน์ทราบตัวบุคคลผู้สั่งการจากเบอร์ +69711984037116 ไม่ได้ รอข้อมูลเพิ่มจากปลายทาง สปป.ลาว',
      stage: 2,
      phones: '+69711984037116',
      plates: '',
      people: '',
      photoIds: '',
      photoFiles: [],
      authorId: 'u-chief',
      authorName: 'หัวหน้าชุดปฏิบัติการข่าว',
      createdAt: '2026-10-10T11:00:00+07:00'
    },
    {
      id: 'e-closed-1',
      caseId: 'case-closed-7925',
      entryDate: '2026-02-13',
      eventTime: '19:00',
      text: 'สกัดจับผู้ลำเลียง 2 ราย พร้อมรถยนต์เก๋งฮอนด้าซีวิคสีขาว ทะเบียน กข 7925 ขอนแก่น และนำส่งพนักงานสอบสวน ปิดเคสส่วนการจับกุมผู้ลำเลียง',
      stage: 5,
      phones: '',
      plates: 'กข 7925 ขอนแก่น',
      people: 'นายกิตติศักดิ์ โนนริบูรณ์, นายวรายุทธ ทิพย์นนท์',
      photoIds: '',
      photoFiles: [],
      authorId: 'u-chief',
      authorName: 'หัวหน้าชุดปฏิบัติการข่าว',
      createdAt: '2026-02-13T21:05:00+07:00'
    }
  ];

  var targets = [
    {
      id: 't-kittisak',
      caseId: 'case-162000',
      name: 'นายกิตติศักดิ์ โนนริบูรณ์',
      nickname: '',
      nationalId: '1430901327535',
      birthDate: '',
      address: '56 หมู่ที่ 10 ตำบลเซกา อำเภอเซกา จังหวัดบึงกาฬ',
      phones: '',
      roleNotes: 'ผู้ต้องหาที่ถูกจับกุมแล้วเมื่อ 13 ก.พ. 69 คนขับ/ผู้รับจ้าง อายุ 20 ปี',
      photoId: '',
      photoFile: 'kittisak.jpg',
      createdAt: '2026-02-13T21:20:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    },
    {
      id: 't-warayut',
      caseId: 'case-162000',
      name: 'นายวรายุทธ ทิพย์นนท์',
      nickname: '',
      nationalId: '1471000187149',
      birthDate: '',
      address: '51 หมู่ที่ 6 ตำบลม่วง อำเภอบ้านม่วง จังหวัดสกลนคร',
      phones: '',
      roleNotes: 'ผู้ต้องหาที่ถูกจับกุมแล้วเมื่อ 13 ก.พ. 69 ผู้โดยสาร/ร่วมลำเลียง อายุ 26 ปี',
      photoId: '',
      photoFile: 'warayut.jpg',
      createdAt: '2026-02-13T21:25:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    },
    {
      id: 't-jakkrapong',
      caseId: 'case-162000',
      name: 'นายจักรพงษ์ พานเหนือ',
      nickname: '',
      nationalId: '2430300020778',
      birthDate: '1992-11-16',
      address: 'บ้านเลขที่ 18 หมู่ที่ 11 ตำบลวิศิษฐ์ อำเภอเมืองบึงกาฬ จังหวัดบึงกาฬ',
      phones: '092-9962820',
      roleNotes: 'เป้าหมายที่ยังติดตาม ผู้ครอบครองเบอร์ 092-9962820 อายุ 33 ปี',
      photoId: '',
      photoFile: 'jakkrapong.jpg',
      createdAt: '2026-10-27T16:45:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    },
    {
      id: 't-rungarun',
      caseId: 'case-162000',
      name: 'นายรุ่งอรุณ คำภู',
      nickname: '',
      nationalId: '1479900368988',
      birthDate: '1998-02-15',
      address: 'บ้านเลขที่ 108 หมู่ที่ 6 ตำบลดงหม้อทองใต้ อำเภอบ้านม่วง จังหวัดสกลนคร',
      phones: '',
      roleNotes: 'เป้าหมายขยายผลพื้นที่ อ.บ้านม่วง อายุ 28 ปี',
      photoId: '',
      photoFile: 'rungarun.jpg',
      createdAt: '2026-10-27T16:50:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    },
    {
      id: 't-jamrat',
      caseId: 'case-162000',
      name: 'นายจำรัส ล้วนวิเศษ',
      nickname: '',
      nationalId: '3470600219292',
      birthDate: '1977-07-15',
      address: 'บ้านเลขที่ 101 หมู่ที่ 1 ตำบลคำบ่อ อำเภอวาริชภูมิ จังหวัดสกลนคร',
      phones: '',
      roleNotes: 'เป้าหมายขยายผลพื้นที่ จ.สกลนคร อายุ 49 ปี',
      photoId: '',
      photoFile: 'jamrat.jpg',
      createdAt: '2026-10-27T16:55:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    },
    {
      id: 't-laos',
      caseId: 'case-laos-caller',
      name: 'ผู้สั่งการฝั่ง สปป.ลาว',
      nickname: '',
      nationalId: '',
      birthDate: '',
      address: 'ยังไม่ทราบที่อยู่ ติดต่อผ่าน LINE / Facebook',
      phones: '+69711984037116',
      roleNotes: 'ยังไม่ทราบตัวบุคคล',
      photoId: '',
      photoFile: '',
      createdAt: '2026-03-20T10:10:00+07:00',
      createdByName: 'สมาชิกชุดปฏิบัติการข่าว'
    },
    {
      id: 't-closed-driver',
      caseId: 'case-closed-7925',
      name: 'นายกิตติศักดิ์ โนนริบูรณ์',
      nickname: '',
      nationalId: '1430901327535',
      birthDate: '',
      address: '56 หมู่ที่ 10 ตำบลเซกา อำเภอเซกา จังหวัดบึงกาฬ',
      phones: '',
      roleNotes: 'ผู้ต้องหาที่ถูกจับกุมแล้ว คนขับ/ผู้รับจ้าง',
      photoId: '',
      photoFile: 'kittisak.jpg',
      createdAt: '2026-02-13T21:30:00+07:00',
      createdByName: 'หัวหน้าชุดปฏิบัติการข่าว'
    }
  ];

  return {
    NOW: NOW,
    users: users,
    roster: roster,
    placeholderUserIds: placeholderUserIds,
    cases: cases,
    entries: entries,
    targets: targets
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SampleData;
}
