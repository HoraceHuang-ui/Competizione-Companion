// ---------------------------------------------------------------------------
// ACC 共享内存读取器
//
// 📌 完整字段偏移表（Physics / Graphic / Static）、单位、加字段步骤：
//    见仓库根目录 ACC-遥测数据参考.md（AGENTS.md 也指向它）
//
// 两个模式：
//   （默认）    持续输出遥测 JSON 行给主进程
//   --probe     一次性把 Physics / Graphic 两页的 4 字节槽位全部 dump 出来，
//               用来在实车里确认某个字段的真实偏移（官方 PDF 与示例头文件存在
//               版本差异：字段改名、以及尾部新增字段，所以新增区的偏移只能实测）。
//               Physics 覆盖到 800、Graphic 覆盖到 4096（超出映射容量会自动回退，
//               输出会打印「实际 dump 大小」），并列出能找到的 UTF-16 可读字符串。
//               差分定位：改一个值前后各跑一次，对比两次输出里变化的槽位。
//
// 输出（默认模式）：stdout 每行一个 JSON，靠 packetId 判新
//   {"active":true,"gas":…,"brake":…,"steer":…,"speedKmh":…,"rpms":…,"gear":…,
//    "tyrePressure":[…],"tyreCoreTemp":[…],"brakeTemp":[…],"compound":"…",
//    "status":2,"session":0,"completedLaps":…,"position":…,"numberOfLaps":…,
//    "sectorIndex":…,"iCurrentTime":…,"iLastTime":…,"iBestTime":…,"sessionTimeLeft":…,
//    "flag":…,"penalty":…,"penaltyTime":…,"tyreSet":…,"trackGripStatus":…,"timeOfDay":…,"padLife":[…],
//    "packetId":…}
//   末尾那几个（tyreSet / trackGripStatus / timeOfDay / padLife）在 1.9 追加区，
//   映射容量不够（老版本 ACC）时给 null（前端显示占位符）。
// stderr 只用于诊断（smVersion 自检），主进程会转成日志。
//
// 注意：源码刻意保持 C# 5 语法（不用字符串插值等），这样系统自带的
//       Framework64\v4.0.30319\csc.exe 也能编译。编译见 native/build-shm-reader.cjs。
// ---------------------------------------------------------------------------

using System;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Text;
using System.Threading;

internal static class AccShmReader
{
    private const string PhysicsName = @"Local\acpmf_physics";
    private const string PhysicsNameFallback = "acpmf_physics";
    private const string GraphicsName = @"Local\acpmf_graphics";
    private const string GraphicsNameFallback = "acpmf_graphics";
    private const string StaticName = @"Local\acpmf_static";

    /// <summary>
    /// Physics 视图长度：要读到 1.9 追加区的 padLife[4]（推算偏移 740..756）。
    /// 实际视图按映射容量收缩（见 TryOpenLargest），读不到的字段一律给 null/哨兵。
    /// </summary>
    private const int PhysicsReadSize = 800;

    /// <summary>Physics 视图下限：再小就连 brakeTemp[4]（348..360）都读不到</summary>
    private const int PhysicsMinSize = 384;

    /// <summary>
    /// Graphic 视图长度：要读到 1.9 追加区的 currentTyreSet（推算偏移 1572）。
    /// 1.8.12 的映射容量只有 1320，所以必须容忍「读不到」并降级给 null。
    /// </summary>
    private const int GraphicsReadSize = 1588;

    /// <summary>Graphic 视图下限：1.8.12 结构体末尾之前的部分全部保留</summary>
    private const int GraphicsMinSize = 256;

    // ---- --probe 的 dump 范围 ----
    // Physics 800 字节：1.9 的 Physics 页在 1.8.12 结构体（712）之后还追加了
    //   waterTemp(712) / brakePressure[4](716) / front·rearBrakeCompound(732,736) /
    //   padLife[4](740) / discLife[4](756) / ignitionOn…absVibrations(772..800)
    // Graphic 4096 字节：1.9 在 1.8.12 结构体末尾（1320）之后追加了一整段
    //   sessionIndex…gapBehind（推算到 1588）。**4096 只是「想要多少」**：
    //   视图不能超过 ACC 建映射时的容量，实际会收缩到容量允许的最大值
    //   （见 TryOpenLargest），打印出的「实际 dump 大小」才是可信区间，
    //   它同时也把这一版结构体的真实大小暴露出来（自检用）。
    private const int ProbePhysicsSize = 800;
    private const int ProbePhysicsMinSize = 400;
    private const int ProbeGraphicSize = 4096;
    /// <summary>收缩下限：至少覆盖 1.8.12 结构体末尾，否则探针没有意义</summary>
    private const int ProbeGraphicMinSize = 1400;
    /// <summary>Static：要 2048（1.9 在 1.8.12 的 688 之后还追加了轮胎名等字符串，别假设 688/784 就是结尾）</summary>
    private const int ProbeStaticSize = 2048;
    private const int ProbeStaticMinSize = 300;
    /// <summary>扫可读字符串时每个候选读的字节数（35 个 UTF-16 字符，够覆盖 wchar[33]）</summary>
    private const int ProbeStringWindow = 70;

    private const int PollMs = 16;            // ~60Hz 轮询，用 packetId 判新
    private const int RetryMs = 500;          // 打不开时的重试间隔
    private const int InactiveEveryMs = 1000; // 无数据时的保活输出间隔

    // ---- Physics 字段偏移（官方示例 SharedFileOut.h，pack(4)，顺序累加；前 32 字节已实测） ----
    private const int OffPacketId = 0;
    private const int OffGas = 4;
    private const int OffBrake = 8;
    private const int OffGear = 16;
    private const int OffRpms = 20;
    private const int OffSteer = 24;
    private const int OffSpeed = 28;
    private const int OffWheelPressure = 88;   // 官方 PDF：Tyre pressure [FL, FR, RL, RR]
    private const int OffWheelSlip = 56;       // 官方 PDF：Tyre slip for each tyre [FL, FR, RL, RR]
    private const int OffTyreCoreTemp = 152;   // 官方 PDF：Tyre rubber core temperature [FL, FR, RL, RR]
    private const int OffAirTemp = 288;        // 官方 PDF：Ambient temperature（实测确认）
    private const int OffRoadTemp = 292;       // 官方 PDF：Track temperature（实测确认）
    private const int OffTc = 204;             // float：TC 是否**正在介入**（0/1，不是 TC 档位）
    private const int OffAbs = 252;            // float：ABS 是否**正在介入**（0/1，不是 ABS 档位）
    private const int OffCarDamage = 224;      // float[5]：前/后/左/右/中（官方：front 0, rear 1, left 2, right 3, centre 4）
    private const int OffSuspensionDamage = 680; // float[4]：悬挂损伤 [FL, FR, RL, RR]
    private const int OffFrontBrakeCompound = 732; // int：前刹车片型号
    private const int OffRearBrakeCompound = 736;  // int：后刹车片型号
    private const int OffBrakeTemp = 348;      // 官方 PDF：Brake discs temperatures
    // ---- Graphic 字段偏移（§1.3；前 1320 字节的布局已实测成立）----
    private const int OffCompound = 176;          // wchar_t tyreCompound[33]
    private const int OffGfxStatus = 4;           // ACC_STATUS：0=OFF 1=REPLAY 2=LIVE 3=PAUSE
    private const int OffGfxSession = 8;          // ACC_SESSION_TYPE：-1 未知 0 练习 1 排位 2 正赛 …
    private const int OffGfxCompletedLaps = 132;
    private const int OffGfxPosition = 136;       // 名次（1 起）
    private const int OffGfxCurrentTime = 140;    // iCurrentTime，毫秒
    private const int OffGfxLastTime = 144;       // iLastTime，毫秒
    private const int OffGfxBestTime = 148;       // iBestTime，毫秒
    private const int OffGfxSessionTimeLeft = 152; // float，**毫秒**（实测读到 13,502,075 ≈ 3h45m；单位不是秒）
    private const int OffGfxSectorIndex = 164;
    private const int OffGfxNumberOfLaps = 172;   // 赛程总圈数
    private const int OffGfxFlag = 1224;          // ACC_FLAG_TYPE（6 = PENALTY 旗）
    private const int OffGfxPenalty = 1228;       // ACC_PENALTY_TYPE（22 = DSQ / wrong way）
    // 官方说明："Penalty time to wait" —— SG10/20/30 的等待秒数 / 罚时秒数（见「判罚」组件的说明）
    private const int OffGfxPenaltyTime = 1220;

    // ---- 1.9 追加区（≥1320）：偏移已用 --probe 差分定位（ACC-遥测数据参考.md §1.2.2）----
    // 实测依据（2026-10，smVersion=1.9）：字符串锚点 deltaLapTime@1328 / estimatedLapTime@1364 /
    // trackStatus@1416 落位，且 Clock 按 1:1 实时推进、trackGripStatus 与 trackStatus 串一致。
    // 完整字段顺序（供核对）：
    //   1320 sessionIndex / 1324 usedFuel / 1328 deltaLapTime[15] / 1360 iDeltaLapTime
    //   1364 estimatedLapTime[15] / 1396 iEstimatedLapTime / 1400 isDeltaPositive
    //   1404 iSplit / 1408 isValidLap / 1412 fuelEstimatedLaps / 1416 trackStatus[33]
    //   1484 missingMandatoryPits / 1488 Clock / 1492..1496 directionLights / 1500..1528 各全局旗
    //   1532 mfdTyreSet / 1536 mfdFuelToAdd / 1540..1552 mfdTyrePressure[4]
    //   1556 trackGripStatus / 1560..1568 rainIntensity 三连
    //   1572 currentTyreSet / 1576 strategyTyreSet / 1580 gapAhead / 1584 gapBehind → 1588
    private const int OffGfxClock = 1488;          // float Clock（一天中的时间，秒）
    private const int OffGfxTrackGrip = 1556;      // ACC_TRACK_GRIP_STATUS
    // 雨强三连（ACC_RAIN_INTENSITY 枚举 0..5）：当前 / 10 分钟后预报 / 30 分钟后预报
    private const int OffGfxRainIntensity = 1560;
    private const int OffGfxRainIntensity10 = 1564;
    private const int OffGfxRainIntensity30 = 1568;
    // TC / ABS **档位**（0..N，不是 Physics 204/252 那两个"是否介入"的 0/1 标志）
    private const int OffGfxTcLevel = 1268;
    private const int OffGfxAbsLevel = 1280;
    // 圈速 delta：值（ms 绝对值）与符号分开给（官方 1.8.12 布局：deltaLapTime 串@1328、
    // iDeltaLapTime@1360、estimatedLapTime 串@1364、iEstimatedLapTime@1396、isDeltaPositive@1400）
    private const int OffGfxDeltaLapTime = 1360;
    private const int OffGfxEstimatedLapTime = 1396;
    private const int OffGfxDeltaPositive = 1400;
    // 玩家车 id（实测 1001/1002 这种，与 UDP 广播 ENTRY_LIST 里的 carEntryId 同域）
    private const int OffGfxPlayerCarId = 1216;
    // Driver stint 剩余额度（官方：TotalTimeLeft = 本场还允许开多久、TimeLeft = 本 stint 还允许开多久）
    private const int OffGfxDriverStintTotalTimeLeft = 1308;
    private const int OffGfxDriverStintTimeLeft = 1312;
    // 本场在赛道上的车数（**实时**：实测 3 辆车时 = 3；官方文档警告它不一定可靠，
    // 所以组件用的是"广播报名表条数 → activeCars → Static numCars"的优先级）
    private const int OffGfxActiveCars = 252;
    // 当前圈是否有效（1 = 有效、0 = 无效；冲出赛道/切弯/被罚时都会置 0）
    private const int OffGfxIsValidLap = 1408;
    // ===== 燃油（官方字段）=====
    // Physics：剩余油量（官方原文 "Amount of fuel remaining in kg"，游戏里按 L 显示，同一个数）
    private const int OffPhysFuel = 12;
    // Graphic `fuelXLap`（官方 "Average fuel consumed per lap in liters"）——
    // **实测确认偏移 1284、类型 float**（本机读到 3.15 = Huracán GT3 合理的每圈油耗；
    // 1316 读到 0，不是这个字段）。我们文档里 1284 那行来自"推算偏移"表且类型误写作 int，已同步更正。
    private const int OffGfxFuelXLap = 1284;
    // Graphic `usedFuel`（官方 "Used fuel since last time refueling"）—— 我们文档里 1324 **已核对** ✅
    private const int OffGfxUsedFuel = 1324;
    private const int OffGfxCurrentTyreSet = 1572; // int currentTyreSet
    // 全局旗：每个一个 int（0/1），1500..1528 连续八个（1.9 追加区，实测 1520 GlobalGreen=1）
    private const int OffGfxGlobalYellow = 1500;
    private const int OffGfxGlobalYellow1 = 1504;
    private const int OffGfxGlobalYellow2 = 1508;
    private const int OffGfxGlobalYellow3 = 1512;
    private const int OffGfxGlobalWhite = 1516;
    private const int OffGfxGlobalGreen = 1520;
    private const int OffGfxGlobalChequered = 1524;
    private const int OffGfxGlobalRed = 1528;

    // ---- 1.9 追加区（Physics）----
    // 官方 Physics 248：pitLimiterOn（int，0/1，限速器是否开启）
      private const int OffPitLimiter = 248;
      private const int OffPadLife = 740;            // float padLife[4]（刹车片剩余寿命）

    // ---- Static：进站窗口（正赛用；官方 1.8.12 布局偏移 676/680）----
    private const string StaticNameFallbackShort = "acpmf_static";
    private const int StaticReadSize = 688;
    private const int OffStaticPitWindowStart = 676;
    private const int OffStaticPitWindowEnd = 680;
    // Static：会话信息（连接时读一次缓存）
    private const int OffStaticNumCars = 64;      // int numCars（本场车数）
    private const int OffStaticCarModel = 68;     // wchar_t carModel[33]（车型名，可推组别）
    private const int OffStaticPlayerNick = 332;  // wchar_t playerNick[33]（车手三字母短名）

    private static readonly Stopwatch Clock = Stopwatch.StartNew();
    private static StreamWriter _out;

    /// <summary>实际打开的 Physics / Graphic 视图长度（容量可能小于请求）</summary>
    private static int _physicsSize;
    private static int _graphicsSize;

    /// <summary>Static 页视图 + 会话内不变的进站窗口（读一次缓存，连接成功时刷新）</summary>
    private static MemoryMappedViewAccessor _static;
    private static int _pitWindowStart = -1;
    private static int _pitWindowEnd = -1;
    private static int _numCars = -1;
    private static string _carModel = null;
    private static string _playerNick = null;
    /** Static 缓存上次刷新时刻（TickCount），每 StaticRefreshMs 重读一次 */
    private static int _staticRefreshedAt = 0;
    private const int StaticRefreshMs = 5000;

    private static int Main(string[] args)
    {
        if (args.Length > 0 && args[0] == "--probe")
        {
            return Probe();
        }

        _out = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        _out.AutoFlush = true;

        MemoryMappedViewAccessor physics = null;
        MemoryMappedViewAccessor graphics = null;
        int lastPacketId = int.MinValue;
        long lastInactiveAt = 0L;
        bool connected = false;

        while (true)
        {
            if (physics == null)
            {
                physics = TryOpenLargest(
                    PhysicsName, PhysicsNameFallback, PhysicsReadSize, PhysicsMinSize, out _physicsSize);
                if (physics == null)
                {
                    long now = Clock.ElapsedMilliseconds;
                    if (now - lastInactiveAt >= InactiveEveryMs)
                    {
                        lastInactiveAt = now;
                        WriteInactive();
                    }
                    Thread.Sleep(RetryMs);
                    continue;
                }

                // 连上时做一次自检：读 Static 页的 smVersion 字符串。
                // 若共享内存布局和假设不一致，这里会立刻暴露成乱码。
                string version = ReadStaticString(0, 30);
                Console.Error.WriteLine(
                    "[reader] 已连接共享内存 " + PhysicsName + "，smVersion=" +
                    (version == null ? "读取失败" : version) +
                    "，physics=" + I(_physicsSize) + "B");
                connected = true;
            }

            if (graphics == null)
            {
                graphics = TryOpenLargest(
                    GraphicsName, GraphicsNameFallback, GraphicsReadSize, GraphicsMinSize, out _graphicsSize);
                if (graphics != null)
                {
                    Console.Error.WriteLine("[reader] graphic=" + I(_graphicsSize) + "B");
                }
            }

            // Static 页：读进来缓存（进站窗口/车数/车型名都在里面）。
            // ⚠️ 这些值**不是会话内不变的**：实测有车加入服务器时 Static.numCars 仍是旧值
            //    （图形页 activeCars 才是实时的），所以这里每 StaticRefreshMs 重读一次。
            if (_static == null)
            {
                _static = TryOpen(StaticName, StaticNameFallbackShort, StaticReadSize);
                if (_static != null)
                {
                    RefreshStaticInfo();
                    Console.Error.WriteLine(
                        "[reader] static pitWindow=" + I(_pitWindowStart) + ".." + I(_pitWindowEnd) +
                        " numCars=" + I(_numCars));
                }
            }
            else if (Environment.TickCount - _staticRefreshedAt >= StaticRefreshMs)
            {
                RefreshStaticInfo();
            }

            try
            {
                int packetId = physics.ReadInt32(OffPacketId);
                if (packetId != lastPacketId)
                {
                    lastPacketId = packetId;
                    WriteActive(physics, graphics, packetId);
                }
            }
            catch (Exception ex)
            {
                // ACC 退出/重启会让映射失效，回到重试分支
                Console.Error.WriteLine("[reader] 读取失败，重新等待共享内存: " + ex.Message);
                Dispose(ref physics);
                Dispose(ref graphics);
                Dispose(ref _static);
                _pitWindowStart = -1;
                _pitWindowEnd = -1;
                if (connected)
                {
                    WriteInactive();
                    lastInactiveAt = Clock.ElapsedMilliseconds;
                    connected = false;
                }
                Thread.Sleep(RetryMs);
                continue;
            }

            Thread.Sleep(PollMs);
        }
    }

    private static void Dispose(ref MemoryMappedViewAccessor accessor)
    {
        if (accessor == null) return;
        try { accessor.Dispose(); }
        catch (Exception) { /* ignore */ }
        accessor = null;
    }

    private static MemoryMappedViewAccessor TryOpen(string name, string fallback, int size)
    {
        return TryOpen(name, fallback, size, false);
    }

    /// <summary>
    /// 打开只读视图。quiet=true 时不打诊断日志（阶梯回退试小尺寸时用，
    /// 否则每个失败尺寸都会刷一行「失败」，噪音盖住真正有用的信息）。
    /// </summary>
    private static MemoryMappedViewAccessor TryOpen(
        string name, string fallback, int size, bool quiet)
    {
        string[] names = new string[] { name, fallback };
        for (int i = 0; i < names.Length; i++)
        {
            try
            {
                MemoryMappedFile mmf = MemoryMappedFile.OpenExisting(
                    names[i], MemoryMappedFileRights.Read);
                return mmf.CreateViewAccessor(0, size, MemoryMappedFileAccess.Read);
            }
            catch (FileNotFoundException)
            {
                // 名字不对或 ACC 没开，试下一个名字
            }
            catch (Exception ex)
            {
                if (!quiet)
                {
                    Console.Error.WriteLine("[reader] 打开 " + names[i] + " 失败: " + ex.Message);
                }
            }
        }
        return null;
    }

    /// <summary>
    /// 打开「容量允许的最大」视图，返回真正开成功的字节数。
    /// 为什么需要：视图不能超过 ACC 建映射时的容量（Graphic 页 1.8.12 是 1320、
    /// 1.9 推算 1588），直接要 4096 会被 Windows 拒绝。
    /// 先试 desired，被拒就在 [minSize, desired) 里二分（步进 4 字节）找出最大值——
    /// 顺带把这一版结构体的真实大小量出来，是很好的布局自检证据。
    /// </summary>
    private static MemoryMappedViewAccessor TryOpenLargest(
        string name, string fallback, int desired, int minSize, out int actualSize)
    {
        MemoryMappedViewAccessor best = TryOpen(name, fallback, desired, true);
        if (best != null)
        {
            actualSize = desired;
            return best;
        }

        best = TryOpen(name, fallback, minSize, true);
        if (best == null)
        {
            actualSize = 0;
            return null;
        }

        int lo = minSize;      // 已知可用
        int hi = desired - 4;  // 已知不可用（desired 刚失败）
        int bestSize = minSize;
        while (lo + 4 <= hi)
        {
            int mid = ((lo + hi) / 2) & ~3;
            if (mid <= lo) break;
            MemoryMappedViewAccessor probe = TryOpen(name, fallback, mid, true);
            if (probe != null)
            {
                Dispose(ref best);
                best = probe;
                bestSize = mid;
                lo = mid;
            }
            else
            {
                hi = mid - 4;
            }
        }

        actualSize = bestSize;
        return best;
    }

    /// <summary>
    /// 刷新 Static 页里「会话内不变」的字段。进站窗口只在正赛有意义：
    /// `PitWindowStart`/`PitWindowEnd` 是圈号区间，0/0 表示本赛节没有进站窗口。
    /// </summary>
    private static void RefreshStaticInfo()
    {
        _staticRefreshedAt = Environment.TickCount;
        try
        {
            _pitWindowStart = _static.ReadInt32(OffStaticPitWindowStart);
            _pitWindowEnd = _static.ReadInt32(OffStaticPitWindowEnd);
            _numCars = _static.ReadInt32(OffStaticNumCars);
            // 车型名（用于推组别）与车手三字母短名：定长 UTF-16，遇 \0 截断
            string carModel = ReadWideString(_static, OffStaticCarModel, 66);
            _carModel = IsPrintable(carModel) ? carModel : null;
            string nick = ReadWideString(_static, OffStaticPlayerNick, 66);
            _playerNick = IsPrintable(nick) ? nick : null;
        }
        catch (Exception)
        {
            _pitWindowStart = -1;
            _pitWindowEnd = -1;
            _numCars = -1;
            _carModel = null;
            _playerNick = null;
        }
    }

    private static string ReadStaticString(int offset, int byteCount)
    {        try
        {
            using (MemoryMappedFile mmf = MemoryMappedFile.OpenExisting(
                StaticName, MemoryMappedFileRights.Read))
            using (MemoryMappedViewAccessor view = mmf.CreateViewAccessor(
                offset, byteCount, MemoryMappedFileAccess.Read))
            {
                return ReadWideString(view, 0, byteCount);
            }
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// <summary>读 wchar_t 定长字符串（UTF-16LE），遇到 \0 截断</summary>
    private static string ReadWideString(MemoryMappedViewAccessor view, int offset, int byteCount)
    {
        byte[] buffer = new byte[byteCount];
        view.ReadArray(offset, buffer, 0, byteCount);
        string text = Encoding.Unicode.GetString(buffer);
        int end = text.IndexOf('\0');
        return end >= 0 ? text.Substring(0, end) : text;
    }

    private static string F(float value)
    {
        // JSON 不接受 NaN / Infinity。未确认的偏移在垃圾字节上很容易读出这两种值，
        // 直接放出去会让主进程整行 JSON.parse 失败——丢的是所有字段，不只这一个。
        if (float.IsNaN(value) || float.IsInfinity(value)) return "0";
        return value.ToString("R", CultureInfo.InvariantCulture);
    }

    private static string I(int value)
    {
        return value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Graphic 读整数：视图没覆盖到该偏移就给 fallback（1.8.12 容量只有 1320）</summary>
    private static int ReadGfxInt(MemoryMappedViewAccessor g, int offset, int fallback)
    {
        if (g == null || offset + 4 > _graphicsSize) return fallback;
        return g.ReadInt32(offset);
    }

    private static float ReadGfxFloat(MemoryMappedViewAccessor g, int offset, float fallback)
    {
        if (g == null || offset + 4 > _graphicsSize) return fallback;
        return g.ReadSingle(offset);
    }

    /// <summary>可选字段：映射容量不够（老版本 ACC）或 Static 还没打开时读不到，写 null 让前端显示占位符</summary>
    private static void AppendOptionalInt(
        StringBuilder json, string name, MemoryMappedViewAccessor view, int offset, int viewSize)
    {
        json.Append(",\"").Append(name).Append("\":");
        if (view == null || offset + 4 > viewSize) json.Append("null");
        else json.Append(I(view.ReadInt32(offset)));
    }

    private static void AppendOptionalFloat(
        StringBuilder json, string name, MemoryMappedViewAccessor view, int offset, int viewSize)
    {
        json.Append(",\"").Append(name).Append("\":");
        if (view == null || offset + 4 > viewSize) json.Append("null");
        else json.Append(F(view.ReadSingle(offset)));
    }

    /// <summary>float 数组：视图覆盖不到就整段写 null（老版本 ACC 的页更短）</summary>
    private static void AppendFloatArray(
        StringBuilder json, string name, MemoryMappedViewAccessor view,
        int offset, int count, int viewSize)
    {
        json.Append(",\"").Append(name).Append("\":");
        if (view == null || offset + count * 4 > viewSize)
        {
            json.Append("null");
            return;
        }
        json.Append('[');
        for (int i = 0; i < count; i++)
        {
            if (i > 0) json.Append(',');
            json.Append(F(view.ReadSingle(offset + i * 4)));
        }
        json.Append(']');
    }

    private static void WriteActive(
        MemoryMappedViewAccessor physics, MemoryMappedViewAccessor graphics, int packetId)
    {
        StringBuilder json = new StringBuilder(1024);
        json.Append("{\"active\":true");
        json.Append(",\"gas\":").Append(F(physics.ReadSingle(OffGas)));
        json.Append(",\"brake\":").Append(F(physics.ReadSingle(OffBrake)));
        json.Append(",\"steer\":").Append(F(physics.ReadSingle(OffSteer)));
        json.Append(",\"speedKmh\":").Append(F(physics.ReadSingle(OffSpeed)));
        json.Append(",\"rpms\":").Append(I(physics.ReadInt32(OffRpms)));
        json.Append(",\"gear\":").Append(I(physics.ReadInt32(OffGear)));
        json.Append(",\"airTemp\":").Append(F(physics.ReadSingle(OffAirTemp)));
        json.Append(",\"roadTemp\":").Append(F(physics.ReadSingle(OffRoadTemp)));
        // TC / ABS 是否正在介入（0/1）：档位在 Graphic 的 TC(1268)/ABS(1280)，别混
        json.Append(",\"tc\":").Append(F(physics.ReadSingle(OffTc)));
        json.Append(",\"abs\":").Append(F(physics.ReadSingle(OffAbs)));

        // 剩余油量（Physics 12，"Amount of fuel remaining"）
        json.Append(",\"fuel\":").Append(F(physics.ReadSingle(OffPhysFuel)));

        // 四轮：官方顺序 [FL, FR, RL, RR]
        AppendFloatArray(json, "wheelSlip", physics, OffWheelSlip, 4, _physicsSize);

        json.Append(",\"tyrePressure\":[");
        json.Append(F(physics.ReadSingle(OffWheelPressure))).Append(',');
        json.Append(F(physics.ReadSingle(OffWheelPressure + 4))).Append(',');
        json.Append(F(physics.ReadSingle(OffWheelPressure + 8))).Append(',');
        json.Append(F(physics.ReadSingle(OffWheelPressure + 12))).Append(']');

        json.Append(",\"tyreCoreTemp\":[");
        json.Append(F(physics.ReadSingle(OffTyreCoreTemp))).Append(',');
        json.Append(F(physics.ReadSingle(OffTyreCoreTemp + 4))).Append(',');
        json.Append(F(physics.ReadSingle(OffTyreCoreTemp + 8))).Append(',');
        json.Append(F(physics.ReadSingle(OffTyreCoreTemp + 12))).Append(']');

        json.Append(",\"brakeTemp\":[");
        json.Append(F(physics.ReadSingle(OffBrakeTemp))).Append(',');
        json.Append(F(physics.ReadSingle(OffBrakeTemp + 4))).Append(',');
        json.Append(F(physics.ReadSingle(OffBrakeTemp + 8))).Append(',');
        json.Append(F(physics.ReadSingle(OffBrakeTemp + 12))).Append(']');

        // 车损：实测 ACC 会填（撞车瞬间就变），但单位不是秒而是「损伤点」，
        // 组装侧按实测比例换算成游戏里显示的修车秒数（见 ACC-遥测数据参考.md §1.2.2）
        AppendFloatArray(json, "carDamage", physics, OffCarDamage, 5, _physicsSize);
        AppendFloatArray(json, "suspensionDamage", physics, OffSuspensionDamage, 4, _physicsSize);
        AppendOptionalInt(json, "brakeCompoundFront", physics, OffFrontBrakeCompound, _physicsSize);
        AppendOptionalInt(json, "brakeCompoundRear", physics, OffRearBrakeCompound, _physicsSize);

        // 胎种字符串：读失败或不是可打印文本就给 null（宁可显示 -- 也不显示乱码）
        string compound = null;
        if (graphics != null && OffCompound + 66 <= _graphicsSize)
        {
            string raw = ReadWideString(graphics, OffCompound, 66);
            if (IsPrintable(raw)) compound = raw;
        }
        json.Append(",\"compound\":");
        json.Append(compound == null ? "null" : "\"" + compound.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");

        // ---- Graphic：赛节 / 名次 / 圈速 / 旗帜（1.8.12 布局，前 1320 字节已实测成立）----
        json.Append(",\"status\":").Append(I(ReadGfxInt(graphics, OffGfxStatus, 0)));
        json.Append(",\"session\":").Append(I(ReadGfxInt(graphics, OffGfxSession, -1)));
        json.Append(",\"completedLaps\":").Append(I(ReadGfxInt(graphics, OffGfxCompletedLaps, 0)));
        json.Append(",\"position\":").Append(I(ReadGfxInt(graphics, OffGfxPosition, 0)));
        json.Append(",\"numberOfLaps\":").Append(I(ReadGfxInt(graphics, OffGfxNumberOfLaps, 0)));
        json.Append(",\"sectorIndex\":").Append(I(ReadGfxInt(graphics, OffGfxSectorIndex, 0)));
        json.Append(",\"iCurrentTime\":").Append(I(ReadGfxInt(graphics, OffGfxCurrentTime, 0)));
        json.Append(",\"iLastTime\":").Append(I(ReadGfxInt(graphics, OffGfxLastTime, 0)));
        json.Append(",\"iBestTime\":").Append(I(ReadGfxInt(graphics, OffGfxBestTime, 0)));
        json.Append(",\"sessionTimeLeft\":").Append(F(ReadGfxFloat(graphics, OffGfxSessionTimeLeft, 0f)));
        json.Append(",\"flag\":").Append(I(ReadGfxInt(graphics, OffGfxFlag, 0)));
        json.Append(",\"penalty\":").Append(I(ReadGfxInt(graphics, OffGfxPenalty, 0)));
        json.Append(",\"penaltyTime\":").Append(F(ReadGfxFloat(graphics, OffGfxPenaltyTime, 0f)));

        // ---- Graphic：1.9 追加区（实测偏移；映射容量不够时写 null）----
        AppendOptionalInt(json, "tyreSet", graphics, OffGfxCurrentTyreSet, _graphicsSize);
        AppendOptionalInt(json, "trackGripStatus", graphics, OffGfxTrackGrip, _graphicsSize);
          AppendOptionalInt(json, "pitLimiterOn", physics, OffPitLimiter, _physicsSize);
        AppendOptionalFloat(json, "timeOfDay", graphics, OffGfxClock, _graphicsSize);
        // 雨强三连（ACC_RAIN_INTENSITY：0 无雨 … 5 雷暴）—— 后两个就是游戏自带的天气预报
        AppendOptionalInt(json, "rainIntensity", graphics, OffGfxRainIntensity, _graphicsSize);
        AppendOptionalInt(json, "rainIntensityIn10min", graphics, OffGfxRainIntensity10, _graphicsSize);
        AppendOptionalInt(json, "rainIntensityIn30min", graphics, OffGfxRainIntensity30, _graphicsSize);
        // TC / ABS 档位（TC=1268、ABS=1280，实测这台车 6/6）
        AppendOptionalInt(json, "tcLevel", graphics, OffGfxTcLevel, _graphicsSize);
        AppendOptionalInt(json, "absLevel", graphics, OffGfxAbsLevel, _graphicsSize);

        // ---- Graphic：全局旗（1.9 追加区，每个一个 int，0/1）----
        json.Append(",\"globalYellow\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalYellow, 0)));
        json.Append(",\"globalYellow1\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalYellow1, 0)));
        json.Append(",\"globalYellow2\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalYellow2, 0)));
        json.Append(",\"globalYellow3\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalYellow3, 0)));
        json.Append(",\"globalWhite\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalWhite, 0)));
        json.Append(",\"globalGreen\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalGreen, 0)));
        json.Append(",\"globalChequered\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalChequered, 0)));
        json.Append(",\"globalRed\":").Append(I(ReadGfxInt(graphics, OffGfxGlobalRed, 0)));

        // ---- Static：进站窗口（圈号区间，0/0 = 本赛节没有进站窗口）----
        AppendOptionalInt(json, "pitWindowStart", _static, OffStaticPitWindowStart, StaticReadSize);
        AppendOptionalInt(json, "pitWindowEnd", _static, OffStaticPitWindowEnd, StaticReadSize);

        // ---- Static：会话信息（连接时读一次缓存）----
        AppendOptionalInt(json, "numCars", _static, OffStaticNumCars, StaticReadSize);
        json.Append(",\"carModel\":");
        json.Append(_carModel == null ? "null" : "\"" + _carModel.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");
        json.Append(",\"playerNick\":");
        json.Append(_playerNick == null ? "null" : "\"" + _playerNick.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");

        // ---- Graphic：圈速 delta（值 + 符号分开；官方推荐用毫秒整数版，别解析字符串版）----
        AppendOptionalInt(json, "deltaLapTimeMs", graphics, OffGfxDeltaLapTime, _graphicsSize);
        AppendOptionalInt(json, "estimatedLapTimeMs", graphics, OffGfxEstimatedLapTime, _graphicsSize);
        AppendOptionalInt(json, "deltaPositive", graphics, OffGfxDeltaPositive, _graphicsSize);
        // 玩家车 id（用来把 UDP 广播里的报名条目精确匹配到"我这辆车"）
        AppendOptionalInt(json, "playerCarId", graphics, OffGfxPlayerCarId, _graphicsSize);
        // Driver stint 剩余额度（ms）：单人等没开换人规则时是 -1000（N/A 哨兵），组件据此隐藏该行
        AppendOptionalInt(json, "driverStintTotalTimeLeft", graphics, OffGfxDriverStintTotalTimeLeft, _graphicsSize);
        AppendOptionalInt(json, "driverStintTimeLeft", graphics, OffGfxDriverStintTimeLeft, _graphicsSize);
        // 实时车数（Static 的 numCars 只在赛节开始时定，有车加入不会变，所以这里也要给一个实时的）
        AppendOptionalInt(json, "activeCars", graphics, OffGfxActiveCars, _graphicsSize);
        // 当前圈是否有效（1 = 有效，0 = 无效）——"排名&圈速"用它做红色覆盖闪烁与红字
        AppendOptionalInt(json, "isValidLap", graphics, OffGfxIsValidLap, _graphicsSize);
        // ===== 燃油：官方字段（float）=====
        AppendOptionalFloat(json, "fuelXLap", graphics, OffGfxFuelXLap, _graphicsSize);
        AppendOptionalFloat(json, "usedFuel", graphics, OffGfxUsedFuel, _graphicsSize);

        // ---- Physics：1.9 追加区 padLife[4]（实测偏移 740；老版本读不到就写 null）----
        json.Append(",\"padLife\":");
        if (OffPadLife + 16 <= _physicsSize)
        {
            json.Append('[');
            json.Append(F(physics.ReadSingle(OffPadLife))).Append(',');
            json.Append(F(physics.ReadSingle(OffPadLife + 4))).Append(',');
            json.Append(F(physics.ReadSingle(OffPadLife + 8))).Append(',');
            json.Append(F(physics.ReadSingle(OffPadLife + 12))).Append(']');
        }
        else
        {
            json.Append("null");
        }

        json.Append(",\"packetId\":").Append(I(packetId));
        json.Append('}');
        _out.WriteLine(json.ToString());
    }

    private static bool IsPrintable(string text)
    {
        if (string.IsNullOrEmpty(text)) return false;
        for (int i = 0; i < text.Length; i++)
        {
            char c = text[i];
            if (c < 0x20 || c > 0x7E) return false;
        }
        return true;
    }

    private static void WriteInactive()
    {
        _out.WriteLine("{\"active\":false}");
    }

    // ---------- --probe：把两页的 4 字节槽位全部 dump 出来，用于实车确认偏移 ----------

    private static int Probe()
    {
        StreamWriter w = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false));
        w.AutoFlush = true;

        w.WriteLine("# ACC 共享内存偏移探针");
        w.WriteLine("# 差分定位用法：进车 → 跑一次 > dump-a.txt → 在游戏里改一个值（MFD 的 Tyre Set 等）");
        w.WriteLine("#             → 再跑一次 > dump-b.txt → 两份输出里只变了的那几个槽位就是字段所在");
        w.WriteLine("# smVersion=" + (ReadStaticString(0, 30) ?? "读取失败"));

        DumpPage(w, "PHYSICS", PhysicsName, PhysicsNameFallback,
            ProbePhysicsSize, ProbePhysicsMinSize, 712);

        int graphicSize = 0;
        MemoryMappedViewAccessor g = TryOpenLargest(
            GraphicsName, GraphicsNameFallback, ProbeGraphicSize,
            ProbeGraphicMinSize, out graphicSize);
        if (g == null)
        {
            w.WriteLine("# GRAPHIC 打不开（ACC 没运行？）");
            return 0;
        }

        w.WriteLine("# GRAPHIC 实际 dump 大小 = " + I(graphicSize) + " 字节" +
            (graphicSize < ProbeGraphicSize
                ? "（请求 " + I(ProbeGraphicSize) + "，被映射容量上限挡住，已收缩到容量最大值）"
                : ""));
        DumpView(w, "GRAPHIC", g, graphicSize, 1320);

        w.WriteLine("# ---- GRAPHIC 里的 UTF-16 可读字符串（只列字符串开头，乱码会现形）----");
        DumpStrings(w, g, graphicSize);
        Dispose(ref g);

        // Static 页也 dump 出来：进站窗口(676/680)这类「正赛才有值」的字段只能这样核对，
        // 顺便量一下 Static 结构体真实大小（1.8.12 推算 688、社区流传 1.9 是 784）
        // 并扫一遍字符串：carModel/track/playerName… 都在定长 wchar 数组里，
        // 它们落位正确就等于把 Static 整段布局（含 PitWindow）验证了一遍。
        int staticSize = 0;
        MemoryMappedViewAccessor s = TryOpenLargest(
            StaticName, StaticNameFallbackShort, ProbeStaticSize, ProbeStaticMinSize, out staticSize);
        if (s == null)
        {
            w.WriteLine("# STATIC 打不开（ACC 没运行？）");
            return 0;
        }
        w.WriteLine("# STATIC 实际 dump 大小 = " + I(staticSize) + " 字节" +
            (staticSize < ProbeStaticSize ? "（已从请求的 " + I(ProbeStaticSize) + " 收缩）" : ""));
        DumpView(w, "STATIC", s, staticSize, 688);
        w.WriteLine("# ---- STATIC 里的 UTF-16 可读字符串（对照 §1.4 的偏移表自检）----");
        DumpStrings(w, s, staticSize);
        Dispose(ref s);
        return 0;
    }

    private static void DumpPage(
        StreamWriter w, string label, string name, string fallback,
        int desiredSize, int minSize, int newFieldsAt)
    {
        int actualSize = 0;
        MemoryMappedViewAccessor view = TryOpenLargest(
            name, fallback, desiredSize, minSize, out actualSize);
        if (view == null)
        {
            w.WriteLine("# " + label + " 打不开（ACC 没运行？）");
            return;
        }
        w.WriteLine("# " + label + " 实际 dump 大小 = " + I(actualSize) + " 字节" +
            (actualSize < desiredSize ? "（已从请求的 " + I(desiredSize) + " 收缩）" : ""));
        DumpView(w, label, view, actualSize, newFieldsAt);
        Dispose(ref view);
    }

    private static void DumpView(
        StreamWriter w, string label, MemoryMappedViewAccessor view, int size, int newFieldsAt)
    {
        w.WriteLine("# ---- " + label + " ----   (off = 偏移, int / float 为同一位置的两种解释)");
        for (int off = 0; off + 4 <= size; off += 4)
        {
            if (newFieldsAt > 0 && off == newFieldsAt)
            {
                w.WriteLine("# ---- 以下为高版本追加区（老文档结构体到此结束）----");
            }
            int asInt = view.ReadInt32(off);
            float asFloat = view.ReadSingle(off);
            w.WriteLine(
                "off=" + off.ToString(CultureInfo.InvariantCulture).PadLeft(4) +
                "  int=" + asInt.ToString(CultureInfo.InvariantCulture).PadLeft(12) +
                "  float=" + asFloat.ToString("0.###", CultureInfo.InvariantCulture));
        }
    }

    /// <summary>
    /// 扫 UTF-16 可读字符串。先整页读进内存，然后只报「字符串开头」
    /// （前一个字符不可打印）——否则一个长字符串会在它覆盖的每个偶数偏移上重复出现，
    /// 差分时全是噪音。
    /// </summary>
    private static void DumpStrings(StreamWriter w, MemoryMappedViewAccessor view, int size)
    {
        byte[] raw = new byte[size];
        view.ReadArray(0, raw, 0, size);
        for (int off = 0; off + ProbeStringWindow <= size; off += 2)
        {
            if (off >= 2 && IsPrintableChar((char)(raw[off - 2] | (raw[off - 1] << 8)))) continue;
            string s = DecodeWide(raw, off, ProbeStringWindow);
            if (s.Length >= 3 && IsPrintable(s))
            {
                w.WriteLine("STR @ " + I(off) + " = \"" + s + "\"");
            }
        }
    }

    private static bool IsPrintableChar(char c)
    {
        return c >= (char)0x20 && c <= (char)0x7E;
    }

    private static string DecodeWide(byte[] raw, int offset, int byteCount)
    {
        string text = Encoding.Unicode.GetString(raw, offset, byteCount);
        int end = text.IndexOf('\0');
        return end >= 0 ? text.Substring(0, end) : text;
    }
}
