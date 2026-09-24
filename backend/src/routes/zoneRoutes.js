const express = require('express');
const zoneRepo = require('../repos/zoneRepo');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await zoneRepo.all());
  })
);

module.exports = router;
