import roomModel from '../models/Room';
import userModel from '../models/User';
import { timezoneChangeToKR } from '../helpers/utility';

const createNewSitData = (
  sitReserveData,
  row,
  column,
  rowBlankLine,
  columnBlankLine,
) => {
  const rowLength = row + rowBlankLine.length;
  const columnLength = column + columnBlankLine.length;
  let sitCount = 1;
  const newSitData = [];
  for (let r = 1; r <= rowLength; r++) {
    for (let c = 1; c <= columnLength; c++) {
      if (rowBlankLine.includes(r) || columnBlankLine.includes(c)) {
        newSitData.push({ sitNum: 0, userId: null });
        continue;
      }
      newSitData.push({
        sitNum: sitCount,
        userId: sitReserveData[sitCount] || 'yet',
      });
      sitCount++;
      continue;
    }
  }
  return newSitData;
};

const resetRoomReserve = async roomNum => {
  const res = await roomModel.updateOne(
    { roomNum },
    { $set: { reservedData: [], resetDate: undefined } },
  );
  console.log(res);
};

const getResetDateArray = async (req, res) => {
  try {
    const arr = await roomModel.find({}, 'roomNum resetDate').exec();
    const arr2 = [];
    for (const room of arr) {
      if (room.resetDate) {
        arr2.push([room.roomNum, new Date(room.resetDate)]);
      }
    }
    arr2.sort((a, b) => {
      return a[1] - b[1];
    });
    // .then(docs => console.log(docs))
    // .catch(err => console.log(err));
    let count = 1;
    let nextResetRoom = [];
    for (let i = 0; i < arr2.length - 1; i++) {
      const isSameTime = arr2[i][1].getTime() == arr2[i + 1][1].getTime();
      if (!isSameTime) break;
      count++;
    }
    for (let i = 0; i < count; i++) {
      nextResetRoom.push(arr2[i][0]);
    }

    let nextResetScheduleData = { date: arr2[0][1], nextResetRoom };
    console.log(nextResetScheduleData);
    return nextResetScheduleData;
  } catch (error) {
    res.status(500).json({ false: false, error });
  }
};

export const getResetTest = async (req, res) => {
  resetRoomReserve(201);
  res.send('Test');
};

export const patchResetDateRoom = async (req, res) => {
  const {
    body: { resetDate: resetDateString, roomNum },
  } = req;
  const resetDate = new Date(resetDateString);
  roomModel
    .findOneAndUpdate({ roomNum }, { $set: { resetDate } })
    .exec()
    .then(docs => console.log(docs));
  res.send(resetDate.toString());
};

export const getTestResetDateRoom = async (req, res) => {
  const {
    params: { id },
  } = req;

  roomModel
    .findOne({ roomNum: id })
    .exec()
    .then(docs => {
      const date = docs.resetDate;

      res.send(date);
    })
    .catch(err => {
      res.status(400).send(err.message);
    });
};

export const getAllRooms = async (req, res) => {
  roomModel.find({}, (err, rooms) => {
    if (err) res.send(err);
    const roomsInfo = rooms.map(room => {
      const { roomNum } = room;
      const maxSit = room.row * room.column;
      return { roomNum, maxSit };
    });
    res.send(roomsInfo);
  });
};

export const getOneRoom = (req, res) => {
  const {
    params: { id },
  } = req;
  roomModel
    .findOne({ roomNum: id })
    .populate('reservedData.user', 'userId')
    .sort({ 'reservedData.sitNum': 1 })
    .exec((err, room) => {
      if (err) return res.status(400).send(err);
      const sitReserveData = {};
      room.reservedData.forEach(data => {
        sitReserveData[data.sitNum] = data.user.userId;
      });

      const newSitData = createNewSitData(
        sitReserveData,
        room.row,
        room.column,
        room.rowBlankLine,
        room.columnBlankLine,
      );
      // const totalRow = room.row + room.rowBlankLine.length;
      // const totalColumn = room.column + room.columnBlankLine.length;
      // const maxSitIncludeBlank = totalRow * totalColumn; //  공간 분리용 칸 포함

      const dataJson = {
        totalRow: room.totalRow,
        totalColumn: room.totalColumn,
        maxSitIncludeBlank: room.maxSitIncludeBlank,
        resetDate: room.resetDate || '',
        reservedData: newSitData,
      };
      return res.send(dataJson);
    });
};

export const postNewRoom = async (req, res) => {
  const {
    body: { roomNum, column, row, columnBlankLine, rowBlankLine, resetDate },
  } = req;
  const result = await roomModel.createRoom(
    roomNum,
    column,
    row,
    columnBlankLine,
    rowBlankLine,
    resetDate,
  );
  res.send(result);
};

export const deleteReserveRoom = async (req, res) => {
  const {
    body: { userId, roomNum, sitNum },
  } = req;
  let userObjectId;

  await userModel
    .findOne({ userId })
    .exec()
    .then(user => (userObjectId = user._id));
  console.log(userObjectId);

  const isReserve = await roomModel
    .findOne(
      {
        roomNum,
        'reservedData.user': userObjectId,
        'reservedData.sitNum': sitNum,
      },
      {
        reservedData: { $elemMatch: { sitNum } },
      },
    )
    .exec()
    .then(docs => {
      console.log(docs);
      if (docs) return true;
      return false;
    });

  if (isReserve) {
    await roomModel.updateOne(
      { roomNum },
      { $pull: { reservedData: { sitNum } } },
    );
    console.log(sitNum);
    res.send({ msg: '삭제했습니다.' });
  } else {
    res.json({ msg: '예약이 되어있지 않습니다.' });
  }

  console.log(isReserve);
};

export const postReserveRoom = async (req, res) => {
  const {
    body: { userId, roomNum, sitNum },
  } = req;
  const isReserve = await roomModel
    .findOne(
      {
        roomNum,
      },
      {
        reservedData: { $elemMatch: { sitNum } },
      },
    )
    .then(docs => {
      if (docs.reservedData.length > 0) return true;
      return false;
    });

  let userObjectId;

  await userModel
    .findOne({ userId })
    .exec()
    .then(user => (userObjectId = user._id));
  const isUserHaveReserve = await roomModel
    .exists({
      roomNum,
      'reservedData.user': userObjectId,
    })
    .then(exist => {
      if (exist) return true;
      return false;
    });

  if (isReserve) {
    res.send({ isSuccess: false, errMsg: '이미 예약된 좌석' });
  } else if (isUserHaveReserve) {
    res.send({
      isSuccess: false,
      errMsg: `${userId}님은 이미 예약한 상태입니다.`,
    });
  } else {
    const userData = await userModel.findOne().where('userId').equals(userId);
    const update = await roomModel.updateOne(
      { roomNum },
      { $addToSet: { reservedData: [{ sitNum, user: userData._id }] } },
      function (err, model) {
        if (err) {
          res.send({ isSuccess: false, errMsg: '에러가 발생했습니다.' });
          return;
        }
        res.send({ isSuccess: true, errMsg: '' });
      },
    );
  }
};
