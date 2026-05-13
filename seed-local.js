/**
 * 音乐鉴赏评价系统 - 本地数据填充脚本
 * 
 * 功能：
 * 1. 直接操作SQLite数据库
 * 2. 创建测试课堂和问题
 * 3. 生成50个学生的模拟回答
 * 4. 使用关键词评分
 * 5. 更新学生素养记录
 * 
 * 使用方法：node seed-local.js
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// 导入关键词评分
const { evaluateWithKeywords, musicKeywords } = require('./db/music-keywords');

// 数据库路径（仅独立运行时使用）
const dbPath = path.join(__dirname, 'db', 'music-eval.db');

// ============ 配置 ============

// 问题配置
const QUESTIONS = [
  {
    content: '请描述贝多芬《命运交响曲》开头给你带来的感受',
    dimensions: ['perception', 'emotion', 'expression']
  },
  {
    content: '贝多芬的音乐如何体现其个人经历与时代背景？',
    dimensions: ['culture', 'emotion', 'aesthetic']
  },
  {
    content: '比较贝多芬《月光奏鸣曲》第一乐章与第三乐章的音乐特征差异',
    dimensions: ['perception', 'emotion', 'culture', 'aesthetic', 'expression']
  },
  {
    content: '用你的语言描绘《欢乐颂》旋律的美',
    dimensions: ['perception', 'aesthetic', 'expression']
  }
];

// 回答水平分布配置：优秀10人、良好15人、一般15人、较差10人
const SCORE_DISTRIBUTION = [
  { level: 'excellent', count: 10, scoreRange: [38, 50] },
  { level: 'good', count: 15, scoreRange: [28, 37] },
  { level: 'average', count: 15, scoreRange: [18, 27] },
  { level: 'poor', count: 10, scoreRange: [5, 17] }
];

// 各水平层次的回答模板（问题1）
const ANSWER_TEMPLATES_Q1 = {
  excellent: [
    '贝多芬《命运交响曲》开头的"命运敲门"动机，以C小调的强烈和弦和短促节奏，瞬间抓住听者的心。那铿锵有力的四个音符，仿佛命运之神在叩击大门，带给我强烈的震撼和紧迫感。这段开头运用了强奏（ff）和弱奏（pp）的强烈对比，展现出命运的不可抗拒力量，同时也预示了整部作品"与命运抗争"的核心主题。节奏坚定有力，采用了贝多芬标志性的"动机发展"手法。',
    '开头那段著名的"命运敲门"主题，以三连音的紧缩节奏和强烈的力度变化，迅速将听者带入紧张、戏剧性的音乐氛围中。贝多芬巧妙运用了动机变形技法，将命运主题的动机素材贯穿全曲。从音乐要素分析，这段开头具有强烈的节拍感、明确的调性（C小调），通过属音到主音的解决营造出戏剧性的张力，带给我强烈的情感共鸣和思考。',
    '《命运交响曲》的开头被誉为音乐史上最伟大的开篇之一。那四个音的动机"铛铛铛铛"，以C小调的强奏和弦形式出现，立即营造出紧张、压迫、充满戏剧张力的氛围。贝多芬运用了不协和音程和强烈的力度对比，展现出命运的残酷与不可逃避。同时，这段音乐在节奏上具有坚定的步伐感，仿佛在诉说人类与命运的永恒斗争，深深震撼了我的心灵。'
  ],
  good: [
    '《命运交响曲》的开头给我留下了深刻印象。那段著名的"命运敲门"动机非常有力量，四个音符的短促动机快速重复，带来了强烈的紧迫感和压迫感。我感受到了一种紧张和抗争的情绪，仿佛命运在敲击大门，作曲家在用音乐表达与命运搏斗的决心。',
    '贝多芬《命运交响曲》开头的这段音乐充满了戏剧性。开头的动机由四个音符组成，以强奏的方式呈现，立即抓住听众的注意力。节奏坚定有力，调性明确，展现出作曲家面对命运挑战时的坚定态度和英雄气概。',
    '开头那短促有力的动机令人震撼。贝多芬用简洁的音乐语言创造了强烈的效果，四个音符的不停反复，仿佛命运的脚步步步逼近，带给我强烈的紧迫感和危机意识，深深感受到了作曲家要与命运抗争的决心。'
  ],
  average: [
    '贝多芬《命运交响曲》开头给我的感觉很震撼。那个"铛铛铛铛"的动机很有特点，短促有力，让我感到一种紧张的气氛。我觉得这段音乐表达了作曲家与命运抗争的精神。',
    '这段音乐开头很有力量感，四个音的动机不停反复，好像在敲门一样。我感受到了一种紧迫和压力，但同时也觉得很有斗志，能够激发人的力量。',
    '《命运交响曲》开头的这段音乐非常有冲击力。那个著名的动机虽然只有几个音，但给人的印象深刻，能够让人一下子感受到紧张的气氛。我觉得这首曲子很有气势。'
  ],
  poor: [
    '这首曲子听起来很有节奏感。',
    '开头很有力量，听起来很震撼。',
    '我觉得这段音乐很好听，有力量。',
    '贝多芬的这首曲子开头很有气势。',
    '音乐很有感染力，让人振奋。'
  ]
};

// 各水平层次的回答模板（问题2）
const ANSWER_TEMPLATES_Q2 = {
  excellent: [
    '贝多芬的音乐深深植根于18世纪末至19世纪初的欧洲社会背景之中。作为古典主义向浪漫主义过渡时期的关键人物，他的作品既继承了海顿、莫扎特的古典传统，又开创了浪漫主义的新风。贝多芬生活在一个动荡的时代——法国大革命的浪潮、拿破仑的崛起与失败、欧洲封建制度的瓦解，这些都在他的音乐中留下了深刻印记。他的聋疾经历使他的音乐更加内省、深刻，《第九交响曲》中对人类解放和普遍友爱的赞颂，正是启蒙运动"自由、平等、博爱"理念的艺术升华。',
    '贝多芬的音乐与他的个人经历和时代背景有着密不可分的联系。他出生于启蒙运动时期的波恩，亲身经历了法国大革命的动荡年代，这些社会变革深刻影响了他的音乐创作理念。在创作中期，聋疾的打击一度让他陷入绝望，但正是在这个时期，他创作出了《英雄交响曲》，标志着古典主义向浪漫主义的转折。他的音乐中充满了对人类精神力量的赞美、对自由平等的追求，反映了启蒙思想的深刻影响，同时也展现了他个人不屈不挠的斗争精神。',
    '从文化视角来看，贝多芬的音乐创作与其时代背景高度契合。18世纪末的欧洲正处于社会大变革时期，法国大革命、自由主义思潮的兴起，深刻影响着艺术家们的创作思想。贝多芬作为这一时代的代表，他的交响曲、奏鸣曲等作品充满了英雄性、戏剧性和哲理性，反映了那个时代人们的精神追求。他的音乐不仅仅是艺术创作，更是对"人"的力量的歌颂，体现了启蒙运动和狂飙突进运动的精神内涵。'
  ],
  good: [
    '贝多芬的音乐深受其所处时代的影响。他生活在大革命时期，亲身经历了法国大革命带来的社会变革，这些在他的音乐中都有体现。他的很多作品充满了对自由、英雄精神的追求，这正是那个时代的思想主流。贝多芬自身的聋疾经历也让他的音乐更加深刻、感人。',
    '贝多芬是古典主义向浪漫主义过渡时期的重要作曲家。他的作品既保留了古典主义的严谨结构，又融入了浪漫主义的情感表达。他经历了启蒙运动和法国大革命的时代，这些社会变革深刻影响了他的音乐理念。他对人类精神力量的赞美、对命运抗争的描写，都体现了那个时代的精神特征。',
    '贝多芬的音乐与其个人经历和时代背景紧密相连。作为一位经历了法国大革命和拿破仑时代的作曲家，他的音乐充满了时代的精神。他的聋疾让他更加专注于内心世界的表达，他的作品往往具有英雄性和戏剧性，反映了他对人类精神力量的坚定信念。'
  ],
  average: [
    '贝多芬的音乐与他的生活时代有关。他生活在欧洲的一个变革时期，经历了法国大革命等重大事件。他的音乐反映了他对那个时代的感受，充满了对自由和英雄精神的追求。',
    '贝多芬创作了很多著名的音乐作品，他的音乐风格受到了当时社会环境的影响。他希望用音乐表达自己的情感和对生活的理解，这种创作理念在当时是比较先进的。',
    '贝多芬是西方音乐史上的重要人物，他的音乐作品与他的个人经历和所处时代密切相关。他通过音乐来表达自己的情感和思想，这些都是时代精神的体现。'
  ],
  poor: [
    '贝多芬是著名的音乐家。',
    '他的音乐作品很多，很好听。',
    '贝多芬生活在一个音乐繁荣的时代。',
    '他的音乐很有感染力。',
    '贝多芬创作了很多经典作品。'
  ]
};

// 各水平层次的回答模板（问题3）
const ANSWER_TEMPLATES_Q3 = {
  excellent: [
    '《月光奏鸣曲》第一乐章与第三乐章在音乐特征上存在显著的差异。第一乐章采用了升C小调，慢板速度，奏鸣曲式，以平静、沉思的旋律线著称。力度变化细腻入微，从pp到ff的渐变营造出月光下湖面涟漪的意境。和声运用上以分解和弦为主，旋律在高低音区游走，充满了诗意的幻想色彩。调性保持相对稳定，以升C小调为核心。\n\n第三乐章则完全不同，升C小调，急板速度，采用了回旋奏鸣曲式。音乐充满激烈的情绪爆发和戏剧性冲突。力度变化剧烈，充满了ff的强奏。节奏紧凑密集，以快速的分解和弦和琶音为主。旋律线充满了强烈的动力感，展现出作曲家内心的风暴和对命运的抗争。两乐章在情绪、速度、结构上形成了鲜明对比。',
    '从音乐要素角度分析，《月光奏鸣曲》的两个乐章呈现出截然不同的特征：\n\n第一乐章：采用持续的慢板速度，三部曲式结构，旋律以抒情性的歌唱线条为主，力度变化细腻，和声以分解和弦形式呈现，营造出朦胧、静谧的意境。调性相对稳定，以升C小调为基础，音色较为暗淡柔和。\n\n第三乐章：采用激动的快板，回旋奏鸣曲式，旋律充满动力性和戏剧性。力度对比强烈，从极弱到极强的快速变化。节奏密集有力，以快速跑动的音符和强烈的和弦为主。和声更加丰富复杂，调性对比明显。\n\n两乐章在情绪上形成从宁静到激昂的强烈对比，充分展现了贝多芬音乐的多面性。',
    '第一乐章与第三乐章的差异主要体现在以下几个方面：\n\n速度与节奏：第一乐章为持续的行板，节奏舒缓平稳；第三乐章为激动的急板，节奏紧凑密集，充满紧迫感。\n\n旋律特征：第一乐章旋律抒情、内敛，以级进为主，富有歌唱性；第三乐章旋律充满动力，跳进频繁，展现出强烈的情感宣泄。\n\n和声与调性：第一乐章和声相对简单，以主调和弦的分解形式为主；第三乐章和声丰富复杂，充满了不协和音程和转调。\n\n力度与音色：第一乐章力度变化细腻，多为弱奏；第三乐章力度对比强烈，充满了戏剧性的强弱变化。\n\n整体而言，第一乐章展现了月夜的宁静美，第三乐章则表达了内心的风暴。'
  ],
  good: [
    '《月光奏鸣曲》第一乐章和第三乐章的音乐特征有明显差异。第一乐章是慢板，采用升C小调，旋律抒情优美，力度变化细腻，营造出安静、沉思的氛围。和声以分解和弦为主，节奏平稳舒缓。\n\n第三乐章则是急板，速度快，节奏紧凑有力。旋律充满动力，力度变化强烈，有很多快速跑动的音符。和声更加丰富，情绪激烈，与第一乐章形成鲜明对比。\n\n两个乐章在速度、力度、情绪上都形成了强烈反差。',
    '从音乐分析的角度看：第一乐章和第三乐章在风格上完全不同。\n\n第一乐章采用了缓慢的速度，旋律线条流畅优美，以抒情的分解和弦为主，力度较轻柔，营造出月光下宁静的氛围。调性稳定，节奏舒缓。\n\n第三乐章则完全不同，它采用了快速的急板，旋律充满动力和激情，节奏紧凑有力。力度变化剧烈，从弱到强的对比明显。和声更加复杂，情绪激烈。\n\n两乐章形成了从静到动的鲜明对比。',
    '《月光奏鸣曲》的第一乐章和第三乐章在多个方面存在差异：\n\n第一乐章速度较慢，旋律抒情内敛，力度轻柔，表现出一种沉思和宁静的情绪。\n\n第三乐章速度极快，旋律充满动力，力度对比强烈，表现出激动和抗争的情绪。\n\n从音乐要素来看，两者在节奏、旋律、力度、和声等方面都有明显不同，展现了贝多芬音乐的多样性和戏剧性。'
  ],
  average: [
    '《月光奏鸣曲》第一乐章和第三乐章有所不同。第一乐章是慢板，速度慢听起来比较安静抒情；第三乐章是快板，速度快听起来比较激烈。两首曲子情绪不太一样。',
    '第一乐章和第三乐章在速度上差别很大。第一乐章比较慢，旋律优美轻柔；第三乐章比较快，力度强烈。总的来说第一乐章比较安静，第三乐章比较激动。',
    '我觉得第一乐章和第三乐章差别明显。第一乐章听起来比较温柔，第三乐章听起来比较激烈。在速度、力度、旋律等方面都有不同。'
  ],
  poor: [
    '第一乐章和第三乐章听起来不一样。',
    '第一乐章比较慢，第三乐章比较快。',
    '两个乐章风格不同。',
    '《月光奏鸣曲》的两个乐章有区别。',
    '它们的速度和感觉不太一样。'
  ]
};

// 各水平层次的回答模板（问题4）
const ANSWER_TEMPLATES_Q4 = {
  excellent: [
    '《欢乐颂》的旋律之美，首先体现在它那宽广流畅的线条上。贝多芬以D大调为基础，采用明快的大调式，旋律以主和弦的分解形式展开，从低到高、从弱到强，逐层递进，如同人类从苦难走向光明的历程。节奏上采用庄重的4/4拍，以四分音符为主的进行具有稳健的步伐感，象征着人类前进的步伐。旋律发展运用了主题变奏和动机贯穿的手法，将"欢乐"这一核心主题不断深化、发展。调性稳定明朗，以D大调为中心，运用了和弦分解、级进与跳进相结合的旋律走向，营造出庄严、崇高、充满希望的意境，充分展现了音乐之美和人类精神的伟大。',
    '《欢乐颂》的旋律之美令人叹为观止。贝多芬以简洁的音乐语言创作出这首不朽的赞歌。旋律以D大调为基础，采用了明朗的大调式音阶，分解和弦式的旋律进行从低到高逐级攀升，如同人类从黑暗走向光明的历程。节奏稳健有力，采用了庄严的节拍，象征着人类团结前进的步伐。旋律发展中运用了主题反复、变化重复等手法，使"欢乐"主题深入人心。调性明亮稳定，和声和谐丰满，充分表达了人类对自由、平等、博爱的追求。整段旋律充满了崇高感和感染力，被誉为人类精神的赞歌。',
    '《欢乐颂》的旋律之美是多方面的：\n\n从旋律线看，它采用宽广的弧形线条，从低音区逐级上升至高音区，形成波浪式的起伏，如同黎明的曙光渐渐照亮大地。\n\n从节奏看，它采用规整稳健的节奏，以整齐的节拍进行，具有行进般的步伐感，象征着人类团结前进的精神。\n\n从和声看，D大调的明朗调性、和谐丰满的和声进行，营造出光明、温暖、充满希望的意境。\n\n从结构看，旋律发展采用了主题变化、重复等手法，使主题思想得到不断强化和深化。\n\n贝多芬用音乐的形式表达了人类对欢乐和博爱的向往，堪称艺术与思想的完美结合。'
  ],
  good: [
    '《欢乐颂》的旋律之美在于它的明朗和感人。贝多芬采用了D大调，旋律以分解和弦的形式展开，从低到高逐级上升，给人一种向上、充满希望的感觉。节奏稳健有力，采用了整齐的节拍。调性明亮稳定，和声和谐。整段旋律充满了欢乐和希望的情感，能够引起听众的共鸣，表达了人类对美好生活的向往。',
    '《欢乐颂》的旋律非常优美动人。首先，在旋律上采用了宽广的线条，从低音区逐渐上升到高音区，形成一种向上的、充满希望的感觉。其次，节奏上采用规整的节拍，稳健有力，象征着人类前进的步伐。调性明朗，采用大调式，和声和谐丰满。整体营造出光明、欢乐、充满力量的意境，充分展现了音乐艺术的魅力。',
    '贝多芬的《欢乐颂》旋律具有独特的美感。旋律采用D大调，明亮开阔，以分解和弦形式展开。节奏稳健有力，具有行进感。旋律线条从低到高逐步上升，象征着人类从苦难走向光明、从黑暗走向希望的过程。调性稳定，和声丰满，充分表达了欢乐和博爱的主题，震撼人心。'
  ],
  average: [
    '《欢乐颂》的旋律很美，让人感到欢乐和希望。贝多芬采用了明快的调性，旋律从低到高，听起来很向上、积极。节奏比较稳健整齐，表达了对美好生活的向往。',
    '《欢乐颂》的旋律给人一种光明、欢乐的感觉。曲调明快，节奏稳定，表达了人类对自由和平等的追求。听完之后让人感到振奋和充满希望。',
    '我觉得《欢乐颂》的旋律很优美，它采用了明朗的调式，旋律向上进行，节奏稳健，给人一种积极向上的感觉，表达了欢乐和友爱的主题。'
  ],
  poor: [
    '《欢乐颂》是一首很好听的曲子。',
    '旋律优美，令人感动。',
    '这首曲子让人感到欢乐。',
    '贝多芬的这首曲子旋律动听。',
    '《欢乐颂》表达了美好的情感。'
  ]
};

const ANSWER_TEMPLATES = [ANSWER_TEMPLATES_Q1, ANSWER_TEMPLATES_Q2, ANSWER_TEMPLATES_Q3, ANSWER_TEMPLATES_Q4];

// ============ 初始化数据库 ============

function initDatabase(db) {
  console.log('正在检查数据库表结构...');
  
  // 创建管理员表
  db.exec(`
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建教师表
  db.exec(`
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      nickname TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  
  // 创建班级表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT,
      description TEXT,
      teacher_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id)
    )
  `);
  
  // 创建学生表
  db.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      class_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (class_id) REFERENCES classes(id)
    )
  `);
  
  // 创建课堂表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      teacher_id INTEGER NOT NULL,
      class_id INTEGER,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (teacher_id) REFERENCES teachers(id),
      FOREIGN KEY (class_id) REFERENCES classes(id)
    )
  `);
  
  // 创建课堂学生关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS classroom_students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      join_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(classroom_id, student_id),
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建问题表
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroom_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      dimensions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
    )
  `);
  
  // 创建回答表
  db.exec(`
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      evaluation TEXT,
      dimensions TEXT,
      total_score REAL,
      comment TEXT,
      eval_method TEXT,
      evaluated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (question_id) REFERENCES questions(id),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建素养记录表
  db.exec(`
    CREATE TABLE IF NOT EXISTS competency_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      dimension TEXT NOT NULL,
      total_score REAL DEFAULT 0,
      answer_count INTEGER DEFAULT 0,
      avg_score REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(student_id, dimension),
      FOREIGN KEY (student_id) REFERENCES students(id)
    )
  `);
  
  // 创建关键词库表
  db.exec(`
    CREATE TABLE IF NOT EXISTS keyword_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      dimension TEXT NOT NULL,
      keyword TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(dimension, keyword)
    )
  `);
  
  console.log('数据库表检查完成');
}

// ============ 辅助函数 ============

// 生成随机数
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 根据目标分数调整回答内容
function adjustAnswerForScore(answer, targetScore, questionIndex) {
  // 根据目标分数决定是否添加关键词来提高分数
  if (targetScore >= 38) {
    // 优秀：确保回答已经很丰富，再适当增强
    return answer;
  } else if (targetScore >= 28) {
    // 良好：移除部分专业术语
    return answer;
  } else if (targetScore >= 18) {
    // 一般：使用较少的专业术语
    return answer;
  } else {
    // 较差：使用最基础的回答
    return answer;
  }
}

// 生成多样性变化
function varyAnswer(answer, variationIndex) {
  const variations = [
    (a) => a,
    (a) => a.replace(/贝多芬/g, ' Beethoven ').replace(/贝多芬/g, '贝多芬'),
    (a) => a.replace(/《/g, '"').replace(/》/g, '"'),
    (a) => a.slice(0, Math.floor(a.length * 0.9)) + '。',
    (a) => a.replace(/，/g, '，').replace(/。/g, '。'),
  ];
  return variations[variationIndex % variations.length](answer);
}

// 更新学生素养记录
function updateCompetencyRecord(db, studentId, dimensions, selectedDimensions) {
  const targetDimensions = selectedDimensions || Object.keys(dimensions);
  
  for (const [dimension, score] of Object.entries(dimensions)) {
    if (!targetDimensions.includes(dimension)) {
      continue;
    }
    
    const existing = db.prepare('SELECT * FROM competency_records WHERE student_id = ? AND dimension = ?').get(
      studentId, dimension
    );
    
    if (existing) {
      const newCount = existing.answer_count + 1;
      const newTotal = existing.total_score * existing.answer_count + score;
      const newAvg = newTotal / newCount;
      
      db.prepare(`
        UPDATE competency_records 
        SET total_score = ?, answer_count = ?, avg_score = ?, updated_at = CURRENT_TIMESTAMP
        WHERE student_id = ? AND dimension = ?
      `).run(newTotal, newCount, newAvg, studentId, dimension);
    } else {
      db.prepare(`
        INSERT INTO competency_records (student_id, dimension, total_score, answer_count, avg_score)
        VALUES (?, ?, ?, ?, ?)
      `).run(studentId, dimension, score, 1, score);
    }
  }
}

// ============ 主函数 ============

async function seed(externalDb) {
  // 如果外部传入了数据库连接则使用，否则自己打开
  let db;
  let ownConnection = false;
  
  if (externalDb) {
    db = externalDb;
  } else {
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('foreign_keys = ON');
    ownConnection = true;
  }
  
  console.log('========================================');
  console.log('音乐鉴赏评价系统 - 数据填充脚本');
  console.log('========================================\n');
  
  // 1. 初始化数据库表
  console.log('【1/6】初始化数据库表结构...');
  initDatabase(db);
  
  // 2. 确保有教师数据
  console.log('\n【2/6】检查教师数据...');
  let teacher = db.prepare("SELECT * FROM teachers WHERE username = 'teacher01'").get();
  
  if (!teacher) {
    const bcrypt = require('bcryptjs');
    const hashedPassword = bcrypt.hashSync('teacher123', 10);
    const result = db.prepare('INSERT INTO teachers (username, password, nickname, email) VALUES (?, ?, ?, ?)').run(
      'teacher01',
      hashedPassword,
      '张老师',
      'zhang@music.edu'
    );
    teacher = { id: result.lastInsertRowid, username: 'teacher01', nickname: '张老师' };
    console.log('已创建教师: teacher01 (密码: teacher123)');
  } else {
    console.log(`已有教师: ${teacher.nickname} (ID: ${teacher.id})`);
  }
  
  // 3. 确保有班级数据
  console.log('\n【3/6】检查班级数据...');
  let classInfo = db.prepare('SELECT * FROM classes WHERE teacher_id = ?').get(teacher.id);
  
  if (!classInfo) {
    const result = db.prepare('INSERT INTO classes (name, grade, description, teacher_id) VALUES (?, ?, ?, ?)').run(
      '音乐鉴赏一班',
      '高一',
      '高一音乐鉴赏必修课程班级',
      teacher.id
    );
    classInfo = { id: result.lastInsertRowid, name: '音乐鉴赏一班' };
    console.log('已创建班级: 音乐鉴赏一班');
  } else {
    console.log(`已有班级: ${classInfo.name} (ID: ${classInfo.id})`);
  }
  
  // 4. 创建课堂（如果已存在则跳过）
  console.log('\n【4/6】创建测试课堂...');
  const classroomName = '贝多芬音乐鉴赏专题';
  
  let existingClassroom = db.prepare("SELECT * FROM classrooms WHERE name = ? AND teacher_id = ?").get(classroomName, teacher.id);
  
  if (existingClassroom) {
    console.log(`课堂已存在: ${classroomName} (ID: ${existingClassroom.id})，跳过创建`);
    console.log('\n✨ 模拟数据已存在，无需重复灌入！');
    return;
  }
  
  const sessionId = uuidv4().replace(/-/g, '').substring(0, 12);
  const classroomDesc = '深入了解贝多芬的经典作品，培养音乐鉴赏能力';
  
  const classroomResult = db.prepare(`
    INSERT INTO classrooms (session_id, name, description, teacher_id, class_id, status)
    VALUES (?, ?, ?, ?, ?, 'active')
  `).run(sessionId, classroomName, classroomDesc, teacher.id, classInfo.id);
  
  const classroomId = classroomResult.lastInsertRowid;
  console.log(`已创建课堂: ${classroomName} (ID: ${classroomId}, Session: ${sessionId})`);
  
  // 5. 创建问题
  console.log('\n【5/6】创建4道问题...');
  const questionIds = [];
  
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const result = db.prepare(`
      INSERT INTO questions (classroom_id, content, dimensions)
      VALUES (?, ?, ?)
    `).run(classroomId, q.content, JSON.stringify(q.dimensions));
    
    questionIds.push(result.lastInsertRowid);
    console.log(`  问题${i + 1}: ${q.content.substring(0, 30)}...`);
    console.log(`    维度: ${q.dimensions.join(', ')}`);
    console.log(`    问题ID: ${result.lastInsertRowid}`);
  }
  
  // 6. 创建50个学生并生成回答
  console.log('\n【6/6】创建50个学生并生成模拟回答...\n');
  
  const studentNames = [
    '王小明', '李小红', '张小华', '刘大力', '陈思思', '杨乐乐', '赵晓敏', '周天天', '吴俊杰', '郑雅文',
    '孙浩然', '周雨萱', '吴思远', '郑浩然', '王雅琪', '李明轩', '张雨涵', '刘子涵', '陈俊杰', '杨诗琪',
    '赵天宇', '周思雨', '吴俊豪', '郑雅婷', '王俊杰', '李雨彤', '张浩然', '刘雅静', '陈思远', '杨子轩',
    '赵雅琳', '周俊杰', '吴思琪', '郑天翔', '王雨萱', '李浩然', '张思远', '刘俊杰', '陈雅婷', '杨天宇',
    '赵思琪', '周浩然', '吴雅静', '郑俊杰', '王天翔', '李思远', '张雅萱', '刘天宇', '陈浩然', '杨思琪'
  ];
  
  // 检查班级中已有的学生
  const existingStudents = db.prepare(`
    SELECT s.* FROM students s 
    WHERE s.class_id = ? 
    ORDER BY s.id
  `).all(classInfo.id);
  
  console.log(`班级中已有 ${existingStudents.length} 名学生`);
  
  // 使用事务批量插入学生
  const insertStudent = db.prepare('INSERT INTO students (student_number, name, class_id) VALUES (?, ?, ?)');
  const insertClassroomStudent = db.prepare('INSERT INTO classroom_students (classroom_id, student_id) VALUES (?, ?)');
  
  const students = [];
  
  // 先将已有学生加入课堂
  for (const s of existingStudents) {
    students.push({ id: s.id, studentNumber: s.student_number, name: s.name });
    // 确保已有学生也加入课堂
    try {
      insertClassroomStudent.run(classroomId, s.id);
    } catch (e) {
      // 可能已存在，忽略
    }
  }
  
  // 如果学生数量不够，补充创建
  const insertNewStudents = db.transaction(() => {
    let nextIndex = existingStudents.length;
    while (students.length < 50) {
      const studentNumber = `2024${String(nextIndex + 1).padStart(3, '0')}`;
      const result = insertStudent.run(studentNumber, studentNames[nextIndex], classInfo.id);
      const studentId = result.lastInsertRowid;
      students.push({ id: studentId, studentNumber, name: studentNames[nextIndex] });
      
      // 加入课堂
      insertClassroomStudent.run(classroomId, studentId);
      nextIndex++;
    }
  });
  
  if (existingStudents.length < 50) {
    insertNewStudents();
    console.log(`已补充创建 ${50 - existingStudents.length} 名学生`);
  }
  
  console.log(`共 ${students.length} 名学生准备生成回答\n`);
  
  // 为每个问题生成50个回答
  console.log('开始生成回答...');
  
  for (let qIdx = 0; qIdx < questionIds.length; qIdx++) {
    const questionId = questionIds[qIdx];
    const question = QUESTIONS[qIdx];
    const templates = ANSWER_TEMPLATES[qIdx];
    
    console.log(`\n  问题${qIdx + 1}: 生成50个回答...`);
    
    // 插入所有回答
    const insertAnswer = db.prepare(`
      INSERT INTO answers (question_id, student_id, content, evaluation, dimensions, total_score, comment, eval_method)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'keyword')
    `);
    
    let answerIndex = 0;
    
    // 按分数分布生成回答
    for (const dist of SCORE_DISTRIBUTION) {
      const levelTemplates = templates[dist.level];
      
      for (let i = 0; i < dist.count; i++) {
        const student = students[answerIndex];
        const templateBase = levelTemplates[randomInt(0, levelTemplates.length - 1)];
        const targetScore = randomInt(dist.scoreRange[0], dist.scoreRange[1]);
        
        // 生成回答内容
        const answerContent = varyAnswer(templateBase, i);
        
        // 使用关键词评分
        const evalResult = evaluateWithKeywords(answerContent, { content: question.content }, question.dimensions);
        
        // 保存回答
        insertAnswer.run(
          questionId,
          student.id,
          answerContent,
          JSON.stringify(evalResult),
          JSON.stringify(evalResult.dimensions),
          evalResult.totalScore,
          evalResult.comment
        );
        
        // 更新素养记录
        updateCompetencyRecord(db, student.id, evalResult.dimensions, question.dimensions);
        
        answerIndex++;
      }
    }
    
    console.log(`    ✓ 已生成50个回答，分布: 优秀10、良好15、一般15、较差10`);
    
    // 显示分数分布统计
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        AVG(total_score) as avg_score,
        MAX(total_score) as max_score,
        MIN(total_score) as min_score
      FROM answers WHERE question_id = ?
    `).get(questionId);
    
    console.log(`    分数统计: 平均${stats.avg_score.toFixed(1)}分, 最高${stats.max_score}分, 最低${stats.min_score}分`);
  }
  
  // 输出总结
  console.log('\n========================================');
  console.log('数据填充完成！');
  console.log('========================================\n');
  
  console.log('📊 数据统计:');
  console.log(`  • 课堂数: 1`);
  console.log(`  • 问题数: ${questionIds.length}`);
  console.log(`  • 学生数: ${students.length}`);
  console.log(`  • 回答数: ${questionIds.length * 50}`);
  
  console.log('\n🔗 访问信息:');
  console.log(`  • 教师端: http://localhost:3000/teacher`);
  console.log(`  • 学生端: http://localhost:3000/answer/${sessionId}`);
  console.log(`  • Session ID: ${sessionId}`);
  
  console.log('\n🔑 登录账号:');
  console.log(`  • 教师: teacher01 / teacher123`);
  
  console.log('\n📁 数据库文件:');
  console.log(`  • ${dbPath}`);
  
  // 关闭数据库连接（仅在自己打开的情况下）
  if (ownConnection) {
    db.close();
    console.log('\n✨ 请重启服务以加载新数据！');
  } else {
    console.log('\n✨ 模拟数据已灌入当前数据库！');
  }
}

// 支持两种使用方式：
// 1. 独立运行: node seed-local.js
// 2. 作为模块导入: const { seed } = require('./seed-local')
module.exports = { seed };

// 独立运行时自动执行
if (require.main === module) {
  seed().catch(err => {
    console.error('脚本执行失败:', err);
    process.exit(1);
  });
}
