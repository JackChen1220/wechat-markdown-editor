(function (global) {
  'use strict';

  var DEFAULT_THEME_ID = 'green';
  var SYSTEM_FONT = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

  function freezeTheme(theme) {
    Object.freeze(theme.colors);
    Object.freeze(theme.scenes);
    Object.freeze(theme.skeleton);
    return Object.freeze(theme);
  }

  function originalTheme(id, name, scenes, description, primary, secondary, primaryLight, shadow, accent) {
    return freezeTheme({
      id: id,
      name: name,
      scenes: scenes,
      description: description,
      colors: {
        primary: primary,
        primaryDark: secondary,
        primaryLight: primaryLight,
        gradient: 'linear-gradient(135deg,' + primary + ',' + secondary + ')',
        shadow: shadow,
        title: '#111827',
        body: '#374151',
        muted: '#9CA3AF',
        border: '#EBEEF5',
        background: '#FFFFFF',
        surface: '#F5F7FA',
        accent: accent || '#FDE68A',
        underline: primary
      },
      underlineCss: 'border-bottom:2px solid ' + primary + ';font-weight:700;',
      skeletonFamily: 'original-classic',
      skeleton: {
        family: 'original-classic',
        hasCover: false,
        hasToc: false,
        tocPlacement: 'none',
        autoTocMinChapters: 0,
        endingMarker: '',
        endingLabel: 'END',
        autoEnding: false,
        hasSignature: false,
        renderH1: true
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '14px',
      lineHeight: '1.85',
      contentPadding: '20px 16px 10px'
    });
  }

  // The registry mirrors references/theme-index.md from gzh-design.
  var themes = [
    originalTheme('green', '翡翠绿', ['通用文章', '教程', '效率工具'], '原版经典骨架，翡翠绿主色与清爽信息卡片。', '#059669', '#10B981', 'rgba(5,150,105,0.1)', 'rgba(5,150,105,0.12)', '#FDE68A'),
    originalTheme('blue', '经典蓝', ['科技', '职场', '知识科普'], '原版经典骨架，稳定清晰的经典蓝配色。', '#2563EB', '#3B82F6', 'rgba(37,99,235,0.1)', 'rgba(37,99,235,0.12)', '#FDE68A'),
    originalTheme('purple', '科技紫', ['AI', '科技趋势', '创意产品'], '原版经典骨架，适合科技与创新内容的紫色配色。', '#7C3AED', '#8B5CF6', 'rgba(124,58,237,0.1)', 'rgba(124,58,237,0.12)', '#FDE68A'),
    originalTheme('red', '中国红', ['热点', '观点', '节庆内容'], '原版经典骨架，醒目有力的中国红配色。', '#DC2626', '#EF4444', 'rgba(220,38,38,0.1)', 'rgba(220,38,38,0.12)', '#FDE68A'),
    originalTheme('orange', '活力橙', ['成长', '营销', '生活方式'], '原版经典骨架，温暖有行动感的橙色配色。', '#EA580C', '#F97316', 'rgba(234,88,12,0.1)', 'rgba(234,88,12,0.12)', '#FDE68A'),
    originalTheme('teal', '清新青', ['健康', '教育', '轻知识'], '原版经典骨架，清新克制的青色配色。', '#0891B2', '#06B6D4', 'rgba(8,145,178,0.1)', 'rgba(8,145,178,0.12)', '#FDE68A'),
    originalTheme('black-gold', '黑金', ['品牌', '商业', '高端专题'], '原版经典骨架，深黑主色与金色点睛。', '#111827', '#1F2937', 'rgba(17,24,39,0.06)', 'rgba(17,24,39,0.12)', '#D4A853'),
    originalTheme('pink', '玫瑰粉', ['女性话题', '生活方式', '情感'], '原版经典骨架，柔和醒目的玫瑰粉配色。', '#DB2777', '#EC4899', 'rgba(219,39,119,0.1)', 'rgba(219,39,119,0.12)', '#FDE68A'),
    freezeTheme({
      id: 'moyu-green',
      name: '摸鱼绿',
      scenes: ['教程', '测评', '清单', '工具盘点'],
      description: '绿色杂志风，卡片丰富、信息密度高，为默认推荐主题。',
      colors: {
        primary: '#059669',
        primaryDark: '#111827',
        primaryLight: '#ECFDF5',
        title: '#111827',
        body: '#374151',
        muted: '#9CA3AF',
        border: '#E5E7EB',
        background: '#FFFFFF',
        surface: '#F9FAFB',
        accent: '#FDE68A',
        underline: '#A7F3D0'
      },
      underlineCss: 'border-bottom:2px solid #A7F3D0;font-weight:600;',
      skeletonFamily: 'magazine-green',
      skeleton: {
        family: 'magazine-green',
        hasCover: true,
        hasToc: true,
        tocPlacement: 'after-cover',
        autoTocMinChapters: 2,
        endingMarker: '///',
        endingLabel: 'LAST'
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '14px',
      lineHeight: '1.9',
      contentPadding: '20px 20px 0'
    }),
    freezeTheme({
      id: 'red-white',
      name: '红白色系',
      scenes: ['深度分析', '观点', '力量感话题'],
      description: '经典编辑风，编号章节、引言卡与签名区，红色克制点睛。',
      colors: {
        primary: '#DC2626',
        primaryDark: '#991B1B',
        primaryLight: '#FEE2E2',
        title: '#1C1917',
        body: '#374151',
        muted: '#9CA3AF',
        border: '#E5E7EB',
        background: '#FFFFFF',
        surface: '#FEF2F2',
        accent: '#FCA5A5',
        underline: '#FECACA'
      },
      underlineCss: 'border-bottom:2px solid #FECACA;font-weight:600;',
      skeletonFamily: 'classic',
      skeleton: {
        family: 'classic',
        hasCover: false,
        hasToc: true,
        tocPlacement: 'before-first-chapter',
        autoTocMinChapters: 3,
        endingMarker: '∞',
        endingLabel: 'THE END'
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '15px',
      lineHeight: '1.8',
      contentPadding: '20px 10px 0'
    }),
    freezeTheme({
      id: 'graphite-minimal',
      name: '石墨极简风',
      scenes: ['设计', '科技评论', '专业观点', '高端品牌'],
      description: '纯灰阶、几何细线与大留白，适合理性且克制的专业内容。',
      colors: {
        primary: '#52525B',
        primaryDark: '#27272A',
        primaryLight: '#F4F4F5',
        title: '#27272A',
        body: '#52525B',
        muted: '#A1A1AA',
        border: '#E4E4E7',
        background: '#FFFFFF',
        surface: '#FAFAFA',
        accent: '#F97316',
        underline: '#52525B'
      },
      underlineCss: 'border-bottom:2px solid #52525B;font-weight:600;',
      skeletonFamily: 'classic',
      skeleton: {
        family: 'classic',
        hasCover: false,
        hasToc: true,
        tocPlacement: 'before-first-chapter',
        autoTocMinChapters: 3,
        endingMarker: '∞',
        endingLabel: 'THE END'
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '15px',
      lineHeight: '1.8',
      contentPadding: '20px 10px 0'
    }),
    freezeTheme({
      id: 'zen-whitespace',
      name: '留白禅意风',
      scenes: ['禅意冥想', '极简生活', '深度随笔', '艺术留白'],
      description: '呼吸感最强的东方留白主题，以细线、衬线字与克制墨绿分层。',
      colors: {
        primary: '#4A5D52',
        primaryDark: '#3D5046',
        primaryLight: '#EEF3F0',
        title: '#2B2B2B',
        body: '#525252',
        muted: '#A3A3A3',
        border: '#E8E8E8',
        background: '#FFFFFF',
        surface: '#FFFFFF',
        accent: '#D6E4DC',
        underline: '#B5C8BC'
      },
      underlineCss: 'border-bottom:1.5px solid #B5C8BC;font-weight:500;',
      skeletonFamily: 'zen',
      skeleton: {
        family: 'zen',
        hasCover: false,
        hasToc: true,
        tocPlacement: 'before-first-chapter',
        autoTocMinChapters: 2,
        endingMarker: '∞',
        endingLabel: 'POSTSCRIPT'
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '15px',
      lineHeight: '1.9',
      contentPadding: '20px 16px 0'
    }),
    freezeTheme({
      id: 'moyu-ticket',
      name: '摸鱼票据风',
      scenes: ['测评', '工具对比', '创意评测'],
      description: '米黄纸感、门票隐喻、星级评分与硬阴影卡片。',
      colors: {
        primary: '#059669',
        primaryDark: '#1A1A1A',
        primaryLight: '#F0FDF4',
        title: '#1A1A1A',
        body: '#555555',
        muted: '#888888',
        border: '#A7F3D0',
        background: '#FFFFFF',
        surface: '#FFFEF8',
        accent: '#7C3AED',
        underline: '#A7F3D0'
      },
      underlineCss: 'border-bottom:2px solid #A7F3D0;font-weight:600;',
      skeletonFamily: 'ticket',
      skeleton: {
        family: 'ticket',
        hasCover: true,
        hasToc: false,
        tocPlacement: 'none',
        autoTocMinChapters: 0,
        endingMarker: '/',
        endingLabel: 'THANKS FOR READING'
      },
      fontFamily: SYSTEM_FONT,
      fontSize: '14px',
      lineHeight: '1.9',
      contentPadding: '20px 20px 0'
    }),
    freezeTheme({
      id: 'olive-journal',
      name: '橄榄手记',
      scenes: ['内刊手记', '深度评测', '案例复盘', '系统性说明文档'],
      description: '编辑部内刊质感，墨黑为主、橙色点睛，信息密度偏高。',
      colors: {
        primary: '#1e1f23',
        primaryDark: '#23251d',
        primaryLight: '#e5e7e0',
        title: '#23251d',
        body: '#4d4f46',
        muted: '#65675e',
        border: '#bfc1b7',
        background: '#fdfdf8',
        surface: '#eeefe9',
        accent: '#ed7b2f',
        underline: '#ed7b2f'
      },
      underlineCss: 'border-bottom:2px solid #ed7b2f;font-weight:600;',
      skeletonFamily: 'journal',
      skeleton: {
        family: 'journal',
        hasCover: true,
        hasToc: false,
        tocPlacement: 'none',
        autoTocMinChapters: 0,
        endingMarker: '///',
        endingLabel: 'END'
      },
      fontFamily: "'IBM Plex Sans',-apple-system,system-ui,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif",
      fontSize: '14px',
      lineHeight: '1.9',
      contentPadding: '20px 8px 8px'
    })
  ];

  var byId = Object.create(null);
  themes.forEach(function (theme) {
    byId[theme.id] = theme;
  });

  var api = Object.freeze({
    version: '1.0.0',
    defaultId: DEFAULT_THEME_ID,
    DEFAULT_THEME_ID: DEFAULT_THEME_ID,
    themes: Object.freeze(themes.slice()),
    list: function () {
      return themes.slice();
    },
    get: function (id) {
      return byId[id] || null;
    },
    has: function (id) {
      return Boolean(byId[id]);
    },
    resolve: function (id) {
      return byId[id] || byId[DEFAULT_THEME_ID];
    }
  });

  global.GzhThemes = api;
})(typeof window !== 'undefined' ? window : globalThis);
