/**
 * 模拟数据生成脚本
 * 用于音乐鉴赏评价系统测试，生成50个学生的模拟回答
 * 
 * 使用方法: 
 *   1. 线上部署: node seed-mock-data.js
 *   2. 本地测试: API_BASE_URL=http://localhost:3000 node seed-mock-data.js
 * 
 * 环境变量:
 *   API_BASE_URL      - API服务器地址 (默认: https://music-eval.zeabur.app)
 *   TEACHER_USERNAME  - 教师用户名 (默认: teacher01)
 *   TEACHER_PASSWORD - 教师密码 (默认: teacher123)
 *   SUBMIT_DELAY     - 提交间隔ms (默认: 500)
 * 
 * 注意事项: 
 *   1. 确保服务器已启动并可通过 CONFIG.baseUrl 访问
 *   2. 确保教师账号存在（默认: teacher01 / teacher123）
 *   3. 确保 AI_ENABLED=false 或已正确配置 AI API
 * 
 * @author AI Assistant
 */

const https = require('https');
const http = require('http');

// ============ 配置区 ============
// 可根据实际情况修改以下配置

const CONFIG = {
  // 线上地址（如果本地测试改为 http://localhost:3000）
  baseUrl: process.env.API_BASE_URL || 'https://music-eval.zeabur.app',
  // 教师登录凭证
  teacherUsername: process.env.TEACHER_USERNAME || 'teacher01',
  teacherPassword: process.env.TEACHER_PASSWORD || 'teacher123',
  // 延迟提交间隔(ms)，避免请求过快
  submitDelay: parseInt(process.env.SUBMIT_DELAY) || 500
};

// 维度常量
const DIMENSIONS = {
  perception: '音乐感知力',
  emotion: '情感理解力',
  culture: '文化认知',
  aesthetic: '审美判断',
  expression: '表达规范'
};

// 所有维度
const ALL_DIMENSIONS = ['perception', 'emotion', 'culture', 'aesthetic', 'expression'];

// ============ 模拟回答模板 ============

// 问题1: 贝多芬《命运交响曲》开头给你带来的感受
const Q1_ANSWERS = {
  excellent: [
    `开篇的「命运敲门」动机以强烈的力度对比和紧凑的节奏型，瞬间抓住听众的注意力。这个c小调的主题具有强大的推动力，通过动机发展手法不断变化重复，传达出与命运抗争的紧张感。四个音符的敲门动机象征着命运的不可抗拒，同时也展现了贝多芬「扼住命运咽喉」的英雄气概。`,
    `《命运交响曲》开头的「当当当-当」仿佛是命运之神沉重的叩门声，以fff的极强力度突然闯入，带来强烈的震撼。这种不协和音程的运用，配合紧迫的三连音节奏，营造出令人窒息的紧张氛围。贝多芬用音乐形象地描绘了命运的压迫，同时也暗示了人类不屈的反抗精神。`,
    `开头动机以极简的四个音符(C-G-G-E)构建出强大的音乐张力，通过ff力度和sfz突强记号的处理，呈现出命运的威严与残酷。这个动机的原型经过转位、变形和展开，成为贯穿全曲的核心素材，体现了贝多芬精湛的动机发展技术。旋律虽然简短，却蕴含着丰富的情感内涵。`
  ],
  good: [
    `贝多芬《命运交响曲》开头给我一种很震撼的感觉，那个动机的节奏很紧凑，听起来像是命运在敲门，有一种紧迫感。整体氛围比较沉重，但又充满了力量。`,
    `开头部分的音乐很有冲击力，力度很强，让人一下子就被吸引住了。我觉得这段音乐表现了人和命运之间的对抗，有一种紧张和不安的情绪在里面。`,
    `贝多芬在开头用了很强的力度，那种「当当当」的声音像是命运的召唤。这个主题虽然简单但是很有力量，让我想到了他与命运抗争的故事。`,
    `这段开头让人感到很震撼，音乐的力度变化很丰富，从弱到强的对比很明显。我觉得贝多芬用音乐表达了他对命运的思考，那种不屈服的精神很打动我。`,
    `开场的动机非常简洁但有力，四个音符的重复构成了整部作品的骨架。这种动机发展的手法展现了贝多芬高超的作曲技巧，同时也传达出深层的情感内涵。`
  ],
  average: [
    `《命运交响曲》开头感觉很有力量，听起来比较紧张，让人觉得有什么重要的事情要发生。`,
    `这段音乐开头挺震撼的，力度很强，有一种紧迫感。`,
    `我觉得开头这段音乐表现了一种紧张的情绪，节奏比较快，力度变化也很多。`,
    `贝多芬的这首曲子开头很有气势，让人一下子就记住了。`,
    `开头给我的感觉是很有力量，但也有一点紧张和不安。`
  ],
  poor: [
    `好听。`,
    `感觉很震撼。`,
    `开头很有力量，我很喜欢。`,
    `这段音乐很激动人心。`,
    `贝多芬很厉害。`
  ],
  wrong: [
    `这段音乐听起来很轻松愉快，像是春天的感觉。`,
    `我觉得这首曲子很适合跳舞，节奏很欢快。`,
    `开头像是摇篮曲，很温柔的感觉。`,
    `这应该是莫扎特的作品吧，很优雅。`
  ]
};

// 问题2: 贝多芬的音乐如何体现其个人经历与时代背景？
const Q2_ANSWERS = {
  excellent: [
    `贝多芬生活在法国大革命和拿破仑时期，他的音乐深刻反映了那个动荡年代的精神。他将英雄主义理念融入交响曲创作，《第三交响曲》原本献给拿破仑体现了对共和理想的追求，后期转向更内省的精神层面。从耳疾带来的绝望到《第九交响曲》的欢乐颂歌，展现了个人苦难如何升华为普世的精神超越。其音乐语言的大胆创新——如不协和音程的运用、规模的扩大——也反映了启蒙时代理性精神对传统的突破。`,
    `贝多芬的创作历程本身就是一部精神传记。早期的英雄风格反映了他对法国大革命理想的热情，中期的危机作品如《悲怆奏鸣曲》倾诉了失去听力的绝望与挣扎。晚期的弦乐四重奏展现了超越物质世界的精神追求，《庄严弥撒》则是宗教信仰与艺术追求的完美融合。他将个人的痛苦升华为艺术的力量，用音乐探讨了人类精神的永恒主题。`,
    `作为跨世纪的音乐家，贝多芬经历了启蒙运动的高峰和浪漫主义的萌芽。他的音乐承载了时代的双重性：既有对古典形式的继承，又有对浪漫情感的开拓。法国大革命的口号「自由、平等、博爱」在他的交响曲中得到了音乐化的表达。他将音乐从贵族沙龙带入公共音乐厅，使艺术成为市民精神生活的一部分。`
  ],
  good: [
    `贝多芬的音乐和他的人生经历密切相关。他中年失聪，这对一个音乐家来说是巨大的打击，但他没有放弃，而是用音乐表达自己的情感。他的很多作品都体现了这种不屈服的精神，比如《命运交响曲》。同时他也受到了法国大革命的影响，作品中有一种英雄主义的气质。`,
    `贝多芬经历了法国大革命和拿破仑时代，他的音乐反映了他对自由和英雄主义的追求。耳疾的折磨让他更加深入地探索音乐的精神层面，写出了很多感人的作品。他的交响曲规模宏大，情感强烈，体现了那个时代人们的精神追求。`,
    `贝多芬的一生充满坎坷，这些经历都体现在他的音乐中。失聪的痛苦、与命运的抗争、对理想的追求，这些都成为他创作的灵感来源。他的作品既有古典主义的严谨结构，又有浪漫主义的情感表达，是两个时代的桥梁。`,
    `贝多芬的音乐体现了启蒙时代的精神，追求理性与情感的平衡。他的交响曲规模宏大，反映了当时人们对音乐厅艺术的热情。拿破仑战争时期的动荡也影响了他的创作，从早期的乐观到后期的深沉，都与时代背景相关。`,
    `从贝多芬的音乐中可以看出他的人生轨迹。早期的作品比较欢快，反映了他年轻时的理想主义。中期经历了失聪的打击，作品变得更加深沉内省。晚期则达到了精神的超脱，写出了《欢乐颂》这样充满希望的作品。`
  ],
  average: [
    `贝多芬的音乐和他的人生经历有关，他失聪后还坚持创作，很令人敬佩。他的作品能听出一些情感的变化。`,
    `贝多芬经历了法国大革命时期，他的音乐有一些英雄性的内容在当时很流行。`,
    `贝多芬的交响曲规模很大，反映了他对音乐艺术的追求。我觉得他的音乐和时代背景有关系。`,
    `他的音乐体现了个人和时代的结合，既有对命运的抗争，也有对美好未来的向往。`,
    `贝多芬在失聪后还能创作出这么多作品，说明他非常热爱音乐，这种精神值得学习。`
  ],
  poor: [
    `贝多芬的音乐很好听。`,
    `他经历了很多苦难，但还是坚持创作。`,
    `我觉得贝多芬的音乐很有感情。`,
    `他和莫扎特是同时代的人。`,
    `贝多芬的交响曲很有名。`
  ],
  wrong: [
    `贝多芬的音乐主要是为了娱乐宫廷贵族，没有什么特别的个人情感。`,
    `他的音乐主要模仿巴洛克时期的风格，没什么创新。`,
    `贝多芬一生顺利，没有什么苦难，所以他的音乐风格比较单一。`,
    `他的音乐和法国大革命没有任何关系，都是虚构的。`
  ]
};

// 问题3: 比较贝多芬《月光奏鸣曲》第一乐章与第三乐章的音乐特征差异
const Q3_ANSWERS = {
  excellent: [
    `《月光奏鸣曲》第一乐章采用幻想曲风格，以升c小调写成，节奏舒缓自由，呈现出沉思冥想的意境。旋律以分解和弦为主，力度变化细腻微妙，营造出月光下湖面般宁静而深邃的氛围。和声进行以半音进行为特色，增加了音乐的不稳定感和情感张力。第三乐章则是激动的快板，采用相同的调性但性格截然不同：激烈的琶音上下翻飞，力度对比强烈，展现出暴风雨般的情感宣泄。两个乐章形成鲜明对比：静与动、内省与外放、冥想与激情。`,
    `从曲式结构看，第一乐章是近乎无调性的自由奏鸣曲式，反映了贝多芬浪漫主义倾向的萌芽。持续的慢板伴奏音型上浮动着若隐若现的旋律线，如同月光洒在湖面。第三乐章则是回旋奏鸣曲式，结构严谨，充满动力性和戏剧性。全乐章充满不安的八分音符和十六分音符的连续进行，f小调的运用更增添了悲壮感。两个乐章的差异体现了贝多芬音乐的双重性：既是古典形式的大师，又是浪漫情感的先驱。`,
    `第一乐章的和声语言极为丰富，大量使用副属和弦和变化和弦，创造出飘忽不定的调性感觉。力度保持在很弱的范围，整体呈现出克制而内省的气质。第三乐章则完全释放了前面积蓄的情感能量，激烈的情绪通过密集的音符倾泻而出。调性回归到主调后，尾声部分更加辉煌灿烂。两个乐章虽同属一部作品，却展现了截然不同的音乐世界。`,
    `从演奏技法角度分析，第一乐章要求踏板的精细控制，音色需要朦胧而富有层次，触键讲究连奏和半连奏的交替。右手的琶音模式构成了月光意象的核心。相较之下，第三乐章需要极其灵活的指尖控制和充沛的爆发力，倚音和震音的大量使用对技术要求极高。两个乐章对演奏者的要求判若云泥，却都是贝多芬钢琴艺术的巅峰体现。`
  ],
  good: [
    `《月光奏鸣曲》第一乐章和第三乐章差别很大。第一乐章是慢板，很安静，像月光下的湖面，旋律比较平缓，力度很轻。第三乐章就完全不一样了，速度快，很激烈，像暴风雨一样，力度对比很强烈。`,
    `第一乐章给我的感觉是安静、沉思的，有一种朦胧的美感。第三乐章则充满激情和动力，像是情感的爆发。贝多芬把两种完全不同的情绪放在同一首奏鸣曲里，形成了很强的对比。`,
    `两个乐章在速度和情绪上差异明显：第一乐章是升c小调的慢板，情感内敛含蓄；第三乐章虽然是同样的调性，但情绪外放激烈。这种「静与动」的对比是这部作品最显著的特征。`,
    `从音乐语言来看，第一乐章以分解和弦为主，节奏自由；第三乐章则以密集的音符进行为主，结构严谨。两者在曲式、和声、力度等方面都有很大不同，展现了贝多芬丰富的音乐想象力。`,
    `第一乐章的月光意象需要用柔和的音色和细腻的踏板来表现，第三乐章则需要强劲的力量和精确的节奏控制。两个乐章对演奏技术的要求完全不同，但都是钢琴文献中的精品。`
  ],
  average: [
    `第一乐章比较慢、很安静，第三乐章快、激烈。`,
    `两个乐章感觉完全不一样，一个像是夜晚，一个像是白天。`,
    `第一乐章是慢板，第三乐章是快板，情绪差别很大。`,
    `我觉得第三乐章比第一乐章更有力量，更激动人心。`,
    `第一乐章适合晚上听，很安静；第三乐章白天听比较合适，很有活力。`
  ],
  poor: [
    `两个乐章差不多。`,
    `第三乐章更好听。`,
    `第一乐章太慢了。`,
    `第三乐章速度快一些。`,
    `都是贝多芬写的。`
  ],
  wrong: [
    `第一乐章和第三乐章其实是同一段音乐，速度变化而已。`,
    `这部作品只有第一乐章，第三乐章是后人加上去的。`,
    `《月光奏鸣曲》其实是莫扎特写的。`,
    `两个乐章的情绪是一样的，都是欢快的。`
  ]
};

// 问题4: 用你的语言描绘《欢乐颂》旋律的美
const Q4_ANSWERS = {
  excellent: [
    `《欢乐颂》的旋律之美在于它的简约与崇高的完美统一。贝多芬采用了最基础的音符材料，却构建出人类音乐史上最崇高的主题之一。旋律以D大调写成，具有民歌般的朴素气质，却蕴含着宗教赞美诗般的庄严。音程以级进为主，偶有四度跳进，既保持了流畅性又增添了力量感。节奏均衡方正，便于传唱，但通过切分音的巧妙运用又避免了机械感。歌词「欢乐女神，圣洁美丽」与旋律的起伏完美契合，仿佛旋律本身就是对欢乐的礼赞。`,
    `这段旋律的美学价值在于它成功传递了人类最纯粹的情感——对欢乐和兄弟情谊的渴望。贝多芬将席勒的诗歌《欢乐颂》谱写成音乐，用最简单的音乐语言表达了最深远的哲学思想。旋律线的进行如同一条缓缓上升的光明之路，从低沉走向明亮，从个体走向全体，最终达到「亿万人，抱起来」的崇高境界。这种从微观到宏观的升华，是这首作品感动无数人的根本原因。`,
    `从音乐本体分析，《欢乐颂》旋律具有典型的古典风格特征：对称的乐句结构、清晰的和声进行、规整的节拍组织。然而贝多芬在此基础上注入了浪漫主义的情感温度，使这首作品超越了时代的局限。旋律中的附点节奏带来轻微的摇摆感，增加了舞蹈性的律动；每次主题再现时叠加的声部，都将情感的浓度推向新的高度。`,
    `这首旋律的美还在于它的包容性和启示性。贝多芬用它证明了：最伟大的音乐不需要复杂的技巧或华丽的装饰，只需要对人类情感的深刻理解和对美好理想的坚定信念。当这一旋律从独唱发展为四重唱，再扩展为合唱和管弦乐队的交响呈现时，音乐所承载的情感也随之升华，最终成为全人类共同的欢乐颂歌。`
  ],
  good: [
    `《欢乐颂》的旋律很美，有一种简单但感人的力量。贝多芬用朴素的音符写出了一段让人难忘的旋律，听起来既庄严又亲切。我觉得这段旋律最美的地方是它表达了一种普世的欢乐情感，能够打动每一个听众。`,
    `这段旋律给我一种很温暖的感觉，像是阳光洒在身上。旋律的进行很自然流畅，很容易跟着哼唱。我觉得贝多芬把歌词和音乐结合得很好，歌词描绘的意境通过音乐得到了很好的表达。`,
    `《欢乐颂》的旋律虽然简单，但蕴含着深刻的意义。我觉得它最美的地方在于那种从个人情感上升到全人类情感的升华过程。从独唱到合唱的发展，像是把个人的欢乐分享给了所有人。`,
    `这段旋律具有民歌般的气质，朴素而优美。节奏规整但不死板，旋律流畅但不空洞。我觉得贝多芬用最简单的音乐语言表达了最崇高的情感，这是这段旋律最了不起的地方。`,
    `《欢乐颂》的旋律有一种纯净的美，像是发自内心的真诚呼唤。我觉得它的美来自于那种对美好事物的向往和对人类团结的期盼，这种情感超越了时代和文化的界限。`
  ],
  average: [
    `《欢乐颂》的旋律很优美，听起来很欢乐。`,
    `这段音乐让人感到快乐，很有感染力。`,
    `我觉得旋律朗朗上口，很容易记住。`,
    `《欢乐颂》表达了人们对欢乐的追求，很正能量。`,
    `旋律简单但很好听，贝多芬写得很棒。`
  ],
  poor: [
    `好听。`,
    `很欢乐的感觉。`,
    `贝多芬的作品当然好听。`,
    `这段旋律很流行。`,
    `我喜欢这段音乐。`
  ],
  wrong: [
    `《欢乐颂》是贝多芬写的悲怆交响曲中的片段。`,
    `这段旋律听起来很悲伤，不适合叫《欢乐颂》。`,
    `《欢乐颂》其实是莫扎特写的，后来被贝多芬改编了。`,
    `这段音乐节奏很复杂，不适合普通人欣赏。`
  ]
};

// ============ 工具函数 ============

/**
 * 发送HTTP请求
 */
function httpRequest(url, method, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = (urlObj.protocol === 'https:' ? https : http).request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        // 检查HTTP状态码
        if (res.statusCode >= 400) {
          resolve({ status: res.statusCode, data: data, error: `HTTP ${res.statusCode}` });
          return;
        }
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/**
 * 检查服务器健康状态
 */
async function checkServerHealth() {
  console.log(`\n🔍 检查服务器状态: ${CONFIG.baseUrl}`);
  try {
    const response = await httpRequest(CONFIG.baseUrl, 'GET');
    if (response.status === 200) {
      console.log('✅ 服务器响应正常');
      return true;
    } else {
      console.log(`⚠️ 服务器返回状态码: ${response.status}`);
      return false;
    }
  } catch (e) {
    console.log(`❌ 服务器连接失败: ${e.message}`);
    return false;
  }
}

/**
 * 生成随机数
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * 从数组中随机选择一个元素
 */
function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

/**
 * 随机打乱数组
 */
function shuffleArray(arr) {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 生成学生姓名
 */
function generateStudentName() {
  const surnames = ['王', '李', '张', '刘', '陈', '杨', '黄', '赵', '周', '吴', '徐', '孙', '马', '朱', '胡', '郭', '何', '林', '罗', '高', '郑', '梁', '谢', '宋', '唐', '许', '韩', '冯', '邓', '曹', '彭', '曾', '肖', '田', '董', '袁', '潘', '于', '蒋', '蔡', '余', '杜', '叶', '程', '苏', '魏', '吕', '丁', '任', '沈'];
  const givenNames = ['伟', '芳', '娜', '秀', '敏', '静', '丽', '强', '磊', '军', '洋', '勇', '艳', '杰', '娟', '涛', '明', '超', '秀', '梅', '兰', '云', '华', '平', '辉', '刚', '桂', '英', '建', '峰', '玲', '琳', '宇', '晨', '欣', '怡', '琪', '雪', '思', '雨', '浩', '博', '凯', '佳', '嘉', '睿', '泽', '阳', '洋', '萱'];
  
  // 特殊组合
  const specialNames = ['梓涵', '子涵', '一诺', '浩然', '欣怡', '子轩', '雨萱', '梓萱', '子墨', '子涵', '浩宇', '欣怡', '佳怡', '思琪', '思雨', '子晴', '诗涵', '雅婷', '雅静', '雅欣'];
  
  if (Math.random() < 0.2) {
    return randomChoice(specialNames);
  }
  return randomChoice(surnames) + randomChoice(givenNames);
}

/**
 * 生成学号
 */
function generateStudentNumber(index) {
  return `2024${String(index + 1).padStart(3, '0')}`;
}

/**
 * 根据质量等级获取回答
 */
function getAnswerByLevel(answers, level) {
  switch (level) {
    case 'excellent': return randomChoice(answers.excellent);
    case 'good': return randomChoice(answers.good);
    case 'average': return randomChoice(answers.average);
    case 'poor': return randomChoice(answers.poor);
    case 'wrong': return randomChoice(answers.wrong);
    default: return randomChoice(answers.average);
  }
}

/**
 * 生成学生回答分配
 * 返回50个学生的回答质量分布
 */
function generateStudentDistribution() {
  const distribution = [];
  
  // 优秀: 10人
  for (let i = 0; i < 10; i++) distribution.push('excellent');
  // 良好: 15人
  for (let i = 0; i < 15; i++) distribution.push('good');
  // 一般: 15人
  for (let i = 0; i < 15; i++) distribution.push('average');
  // 较差: 10人
  for (let i = 0; i < 10; i++) distribution.push('poor');
  
  return shuffleArray(distribution);
}

/**
 * 延迟函数
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============ 主流程 ============

async function main() {
  console.log('🎵 音乐鉴赏评价系统 - 模拟数据生成器');
  console.log('='.repeat(50));
  
  try {
    // 步骤0: 检查服务器状态
    console.log('\n🔍 步骤0: 检查服务器连接...');
    const isHealthy = await checkServerHealth();
    if (!isHealthy) {
      console.error('\n❌ 服务器不可用，请检查以下事项:');
      console.error('   1. 确认服务已部署到 Zeabur');
      console.error('   2. 确认服务状态为"运行中"');
      console.error('   3. 检查 Zeabur 日志排查启动错误');
      console.error(`   4. 或修改脚本中的 baseUrl 指向正确的地址`);
      console.error('\n💡 本地测试: API_BASE_URL=http://localhost:3000 node seed-mock-data.js');
      process.exit(1);
    }
    
    // 步骤1: 教师登录
    console.log('\n📝 步骤1: 教师登录...');
    console.log(`   尝试登录: ${CONFIG.baseUrl}/api/auth/login`);
    console.log(`   用户名: ${CONFIG.teacherUsername}`);
    
    const loginResult = await httpRequest(
      `${CONFIG.baseUrl}/api/auth/login`,
      'POST',
      {},
      {
        username: CONFIG.teacherUsername,
        password: CONFIG.teacherPassword,
        role: 'teacher'
      }
    );
    
    if (!loginResult.data || !loginResult.data.success) {
      console.error('   登录响应:', JSON.stringify(loginResult.data));
      throw new Error(`登录失败: ${loginResult.data?.message || '未知错误'}`);
    }
    
    const teacherToken = loginResult.data.data.token;
    console.log(`✅ 登录成功! 教师: ${loginResult.data.data.user.nickname}`);
    
    // 步骤2: 创建测试课堂
    console.log('\n📝 步骤2: 创建测试课堂...');
    const classroomResult = await httpRequest(
      `${CONFIG.baseUrl}/api/teacher/classrooms`,
      'POST',
      { 'Authorization': `Bearer ${teacherToken}` },
      {
        name: '模拟测试-贝多芬专题',
        description: '用于数据看板测试的模拟课堂数据'
      }
    );
    
    if (!classroomResult.data.success) {
      throw new Error(`创建课堂失败: ${classroomResult.data.message}`);
    }
    
    const classroomId = classroomResult.data.data.id;
    const sessionId = classroomResult.data.data.sessionId;
    console.log(`✅ 课堂创建成功!`);
    console.log(`   课堂ID: ${classroomId}`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   加入链接: ${CONFIG.baseUrl}/answer/${sessionId}`);
    
    // 步骤3: 创建问题
    console.log('\n📝 步骤3: 创建4道问题...');
    
    const questions = [
      {
        content: '请描述贝多芬《命运交响曲》开头给你带来的感受',
        dimensions: ['perception', 'emotion', 'expression'],
        answers: Q1_ANSWERS
      },
      {
        content: '贝多芬的音乐如何体现其个人经历与时代背景？',
        dimensions: ['culture', 'emotion', 'aesthetic'],
        answers: Q2_ANSWERS
      },
      {
        content: '比较贝多芬《月光奏鸣曲》第一乐章与第三乐章的音乐特征差异',
        dimensions: ALL_DIMENSIONS,
        answers: Q3_ANSWERS
      },
      {
        content: '用你的语言描绘《欢乐颂》旋律的美',
        dimensions: ['perception', 'aesthetic', 'expression'],
        answers: Q4_ANSWERS
      }
    ];
    
    const questionIds = [];
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const result = await httpRequest(
        `${CONFIG.baseUrl}/api/teacher/questions`,
        'POST',
        { 'Authorization': `Bearer ${teacherToken}` },
        {
          classroomId: classroomId,
          content: q.content,
          dimensions: q.dimensions
        }
      );
      
      if (!result.data.success) {
        throw new Error(`创建问题${i + 1}失败: ${result.data.message}`);
      }
      
      questionIds.push(result.data.data.id);
      console.log(`✅ 问题${i + 1}创建成功: ${q.content.substring(0, 30)}...`);
    }
    
    // 步骤4: 生成50个学生并提交回答
    console.log('\n📝 步骤4: 生成50个学生并提交回答...');
    
    const questionStats = questions.map(() => ({ total: 0, success: 0 }));
    const allStudents = [];
    
    // 生成学生分布
    const distributions = {
      q1: generateStudentDistribution(),
      q2: generateStudentDistribution(),
      q3: generateStudentDistribution(),
      q4: generateStudentDistribution()
    };
    
    for (let i = 0; i < 50; i++) {
      const studentNumber = generateStudentNumber(i);
      const studentName = generateStudentName();
      allStudents.push({ number: studentNumber, name: studentName });
      
      // 加入课堂获取token
      const joinResult = await httpRequest(
        `${CONFIG.baseUrl}/api/auth/join`,
        'POST',
        {},
        {
          sessionId: sessionId,
          studentName: studentName,
          studentNumber: studentNumber
        }
      );
      
      if (!joinResult.data.success) {
        console.log(`   ⚠️ 学生${studentName}加入课堂失败: ${joinResult.data.message}`);
        continue;
      }
      
      const studentToken = joinResult.data.token;
      
      // 为每道题提交回答
      for (let q = 0; q < questions.length; q++) {
        const level = distributions[`q${q + 1}`][i];
        const answer = getAnswerByLevel(questions[q].answers, level);
        
        const submitResult = await httpRequest(
          `${CONFIG.baseUrl}/api/student/answers`,
          'POST',
          { 'Authorization': `Bearer ${studentToken}` },
          {
            questionId: questionIds[q],
            content: answer
          }
        );
        
        questionStats[q].total++;
        if (submitResult.data.success) {
          questionStats[q].success++;
        }
        
        await delay(CONFIG.submitDelay);
      }
      
      // 进度显示
      if ((i + 1) % 10 === 0 || i === 49) {
        console.log(`   进度: ${i + 1}/50 学生回答提交完成`);
      }
    }
    
    // 步骤5: 输出结果
    console.log('\n' + '='.repeat(50));
    console.log('🎉 模拟数据生成完成!');
    console.log('='.repeat(50));
    
    console.log('\n📊 课堂信息:');
    console.log(`   课堂ID: ${classroomId}`);
    console.log(`   课堂名称: 模拟测试-贝多芬专题`);
    console.log(`   Session ID: ${sessionId}`);
    
    console.log('\n📝 问题提交统计:');
    for (let i = 0; i < questions.length; i++) {
      const stat = questionStats[i];
      const content = questions[i].content;
      console.log(`   问题${i + 1}: ${stat.success}/${stat.total}人提交成功`);
      console.log(`           ${content.substring(0, 40)}...`);
    }
    
    console.log('\n🔗 访问链接:');
    console.log(`   学生端: ${CONFIG.baseUrl}/answer/${sessionId}`);
    console.log(`   教师端: ${CONFIG.baseUrl}/teacher`);
    console.log(`   数据看板: ${CONFIG.baseUrl}/teacher/classroom/${classroomId}`);
    
    console.log('\n💡 提示:');
    console.log('   1. 请使用教师账号登录查看数据看板');
    console.log('   2. 教师账号: teacher01 / teacher123');
    console.log('   3. 回答已自动进行AI评价（或关键词评价）');
    console.log('   4. 数据看板会实时更新统计信息');
    
  } catch (error) {
    console.error('\n❌ 发生错误:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.error('   ❗ 可能原因: 服务器未启动或网络连接失败');
      console.error(`   💡 请确认 ${CONFIG.baseUrl} 可访问`);
    } else if (error.code === 'ENOTFOUND') {
      console.error('   ❗ 可能原因: DNS解析失败，域名无法解析');
      console.error(`   💡 请确认域名 ${CONFIG.baseUrl} 正确`);
    } else if (error.message && error.message.includes('fetch')) {
      console.error('   ❗ 网络请求失败');
    }
    
    console.error('\n📋 排查步骤:');
    console.error('   1. 确认服务器已部署并运行中');
    console.error('   2. 访问 ' + CONFIG.baseUrl + ' 检查是否正常');
    console.error('   3. 确认教师账号存在且密码正确');
    console.error('   4. 如本地测试，可使用: API_BASE_URL=http://localhost:3000 node seed-mock-data.js');
    
    process.exit(1);
  }
}

// 运行
main();
