const { audit } = require('../services');

async function getJob(req, res, next) {
  try {
    const { jobId } = req.params;
    
    const job = await audit.getJob(jobId);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    const events = await audit.getJobEvents(jobId);
    
    res.json({ job, events });
  } catch (err) {
    next(err);
  }
}

async function queryJobs(req, res, next) {
  try {
    const { queue, status, from, to, limit } = req.query;
    
    const jobs = await audit.queryJobs(
      { queue, status, from, to },
      { limit: limit ? parseInt(limit, 10) : undefined }
    );
    
    res.json({ jobs });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getJob,
  queryJobs,
};
