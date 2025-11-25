<script setup lang="ts">
defineProps({
  level: {
    type: Number,
    required: true,
  },
})

// 外层：联赛；内层：等级
const penaltyLevels = [
  [
    {
      license: '0',
      time: '5/10',
      note: '重复可累加',
    },
    {
      license: '0-1',
      time: '5/10/25',
      note: '重复可累加',
    },
    {
      license: '1-3',
      time: '25/50',
      note: '两次提升至等级四',
    },
    {
      license: '2-8',
      time: '取消成绩',
      note: '-',
    },
    {
      license: '3-12',
      time: '取消成绩',
      note: '禁赛一场新手联赛',
    },
  ],
  [
    {
      license: '0',
      time: '5/10',
      note: '重复可累加',
    },
    {
      license: '1-2',
      time: '5/10/25',
      note: '重复可累加',
    },
    {
      license: '2-4',
      time: '25/50',
      note: '两次提升至等级四',
    },
    {
      license: '3-8',
      time: '取消成绩',
      note: '-',
    },
    {
      license: '4-12',
      time: '取消成绩',
      note: '禁赛一场同级联赛',
    },
  ],
  [
    {
      license: '1',
      time: '5/10/15',
      note: '重复可累加',
    },
    {
      license: '2-3',
      time: '10/15/30',
      note: '重复可累加',
    },
    {
      license: '3-5',
      time: '30/60/90',
      note: '两次提升至等级四',
    },
    {
      license: '4-8',
      time: '取消成绩',
      note: '-',
    },
    {
      license: '5-12',
      time: '取消成绩',
      note: '禁赛一场同级联赛',
    },
  ],
]

const colTitles = ['扣驾照分', '罚时', '备注']
const rowTitles = ['新手', '青铜/白银', '黄金/铂金']
</script>

<template>
  <table>
    <thead>
      <tr>
        <th></th>
        <th v-for="title in colTitles" :key="title">{{ title }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(title, idx) in rowTitles" :key="title">
        <td>{{ title }}</td>
        <td>{{ penaltyLevels[idx][level - 1]?.license ?? '-' }}</td>
        <td>{{ penaltyLevels[idx][level - 1]?.time ?? '-' }}</td>
        <td>{{ penaltyLevels[idx][level - 1]?.note ?? '-' }}</td>
      </tr>
    </tbody>
  </table>
</template>

<style scoped>
table,
th,
td {
  border-collapse: collapse;
  border: 1px solid rgb(var(--mdui-color-surface-bright));
  padding: 4px;
}
</style>
