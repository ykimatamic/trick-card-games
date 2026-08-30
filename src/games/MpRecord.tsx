import React from 'react';
import { loadStats, winRate } from './gameStats';

interface MpRecordProps {
  gameId: string;
}

/**
 * 対象ゲームの「これまでの戦績」を表示する小さなバー。
 * 結果モーダル内に置くことで、直近の対局を含めた記録を確認できる。
 */
export const MpRecord: React.FC<MpRecordProps> = ({ gameId }) => {
  const stats = loadStats(gameId);
  const rate = winRate(stats);
  return (
    <div className="mp-record">
      <span className="mp-record-title">これまでの戦績</span>
      <div className="mp-record-cols">
        <span>
          対戦 <b>{stats.played}</b> 回
        </span>
        <span>
          勝利 <b>{stats.wins}</b> 回
        </span>
        <span>
          勝率 <b>{rate}%</b>
        </span>
        <span>
          現在連勝 <b>{stats.streak}</b>
        </span>
        <span>
          最多連勝 <b>{stats.bestStreak}</b>
        </span>
      </div>
    </div>
  );
};
