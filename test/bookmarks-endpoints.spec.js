const { expect } = require('chai')
const knex = require('knex')
const supertest = require('supertest')
const app = require('../src/app')
const { makeBookmarksArray, makeMaliciousBookmark } = require('./bookmarks-fixtures')

describe('Bookmarks Endpoints', function () {
    let db

    before('make knex instance', () => {
        db = knex({
            client: 'pg',
            connection: process.env.TEST_DB_URL,
        })
        app.set('db', db)
    })

    after('disconnect from db', () => db.destroy())

    before('clean the table', () => db('bookmarks').truncate())

    afterEach('cleanup', () => db('bookmarks').truncate())
    
    describe(`Unauthorized requests`, () => {
      const testBookmarks = makeBookmarksArray()

      beforeEach('insert bookmarks', () => {
        return db
          .into('bookmarks')
          .insert(testBookmarks)
      })

      it(`responds with 401 Unauthorized GET /bookmarks`, () => {
        return supertest(app)
          .get('/bookmarks')
          .expect(401, { error: 'Unauthorized request' })
      })

      it(`responds with 401 Unauthorized POST /bookmarks`, () => {
        return supertest(app)
          .post('/bookmarks')
          .send({ title: 'test-title', url: 'http://some.thing.com', rating: 1})
          .expect(401, { error: 'Unauthorized request' })
      })

      it(`responds with 401 Unauthorized GET /bookmarks/:id`, () => {
        const secondBookmark = testBookmarks[1]
        return supertest(app)
          .get(`/bookmarks/${secondBookmark.id}`)
          .expect(401, { error: 'Unauthorized request' })
      })

      it(`responds with 401 Unauthorized DELETE /bookmarks/:id`, () => {
        const aBookmark = testBookmarks[1]
        return supertest(app)
          .delete(`/bookmarks/${aBookmark.id}`)
          .expect(401, { error: 'Unauthorized request' })
      })
    })




    describe(`GET /bookmarks`, () => {
        context(`Given no bookmarks`, () => {
          it(`responds with 200 and an empty list`, () => {
            return supertest(app)
              .get('/bookmarks')
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(200, [])
          })
        })
    
        context('Given there are bookmarks in the database', () => {
          const testBookmarks = makeBookmarksArray()
    
          beforeEach('insert bookmarks', () => {
            return db
              .into('bookmarks')
              .insert(testBookmarks)
          })
    
          it('responds with 200 and all of the bookmarks', () => {
            return supertest(app)
              .get('/bookmarks')
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(200, testBookmarks)
          })
        })
        context('Given an XSS attack bookmark', () => {
          const { maliciousBookmark, expectedBookmark} = makeMaliciousBookmark()

          beforeEach('Insert malicious bookmark', () => {
            return db
              .into('bookmarks')
              .insert([maliciousBookmark])
          })

          it('removes XSS attack content', () => {
            return supertest(app)
              .get( `/bookmarks`)
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(200)
              .expect(res => {
                expect(res.body[0].title).to.eql(expectedBookmark.title)
                expect(res.body[0].description).to.eql(expectedBookmark.description)
              })
          })
        })

      })
    
      describe(`GET /bookmarks/:id`, () => {
        context(`Given no bookmarks`, () => {
          it(`responds with 404`, () => {
            const bookmarkId = 123456
            return supertest(app)
              .get(`/bookmarks/${bookmarkId}`)
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(404, { error: { message: `Bookmark not found` } })
          })
        })
    
        context('Given there are bookmarks in the database', () => {
          const testBookmarks = makeBookmarksArray()
    
          beforeEach('insert bookmarks', () => {
            return db
              .into('bookmarks')
              .insert(testBookmarks)
          })
    
          it('responds with 200 and the specified bookmark', () => {
            const bookmarkId = 2
            const expectedBookmark = testBookmarks[bookmarkId - 1]
            return supertest(app)
              .get(`/bookmarks/${bookmarkId}`)
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(200, expectedBookmark)
          })
        })

        context(`Given an XSS attack bookmark`, () => {
          const { maliciousBookmark, expectedBookmark} = makeMaliciousBookmark()

          beforeEach('Insert malicious bookmark', () => {
            return db
              .into('bookmarks')
              .insert([maliciousBookmark])
          })

          it('removes XSS attack content', () => {
            return supertest(app)
              .get( `/bookmarks/${maliciousBookmark.id}`)
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(200)
              .expect(res => {
                expect(res.body.title).to.eql(expectedBookmark.title)
                expect(res.body.description).to.eql(expectedBookmark.description)
              })
          })
        })
    })

    describe('DELETE /bookmarks/:id', () => {
      context(`Given no bookmarks`, () => {
        it(`responds 404 when bookmark doesn't exist`, () => {
          return supertest(app)
            .delete(`/bookmarks/123`)
            .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
            .expect(404, {
              error: { message: `Bookmark not found` }
            })

        })
      })

      context(`Given there are bookmarks in the database`, () => {
        const testBookmarks = makeBookmarksArray()

        beforeEach('insert bookmarks', () => {
          return db
            .into('bookmarks')
            .insert(testBookmarks)
        })

        it('removes the bookmark by ID from the store', () => {
          const idToRemove = 2
          const expectedBookmarks = testBookmarks.filter(bm => bm.id !== idToRemove)
          return supertest(app)
            .delete(`/bookmarks/${idToRemove}`)
            .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
            .expect(204)
            .then(() => 
              supertest(app)
                .get(`/bookmarks`)
                .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
                .expect(expectedBookmarks)
            )
        })
      })
    })

    describe('POST /bookmarks', () => {
      it(`responds with 400 missing 'title' if not supplied`, () => {
        const newBookmarkMissingTitle = {
          // title: 'test-title',
          url: 'https://test.com',
          rating: 1,
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmarkMissingTitle)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(400, {
            error: { message: `'title' is required`}
          })
      })

      it(`responds with 400 missing 'url' if not supplied`, () => {
        const newBookmarkMissingUrl = {
          title: 'test-title',
          // url: 'https://test.com',
          rating: 1,
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmarkMissingUrl)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(400, {
            error: { message: `'url' is required`}
          })
      })

      it(`responds with 400 missing 'rating' if not supplied`, () => {
        const newBookmarkMissingRating = {
          title: 'test-title',
          url: 'https://test.com',
          // rating: 1,
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmarkMissingRating)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(400, {
            error: { message: `'rating' is required`}
          })
      })

      it(`responds with 400 invalid 'rating' if not between 0 and 5`, () => {
        const newBookmarkInvalidRating = {
          title: 'test-title',
          url: 'https://test.com',
          rating: 'invalid',
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmarkInvalidRating)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(400, {
            error: { message: `'rating' must be a number between 0 and 5` }
          })
      })
  
      it(`responds with 400 invalid 'url' if not a valid URL`, () => {
        const newBookmarkInvalidUrl = {
          title: 'test-title',
          url: 'htp://invalid-url',
          rating: 1,
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmarkInvalidUrl)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(400, {
            error: { message: `'url' must be a valid URL` }
          })
      })

      it('adds a new bookmark to the store', () => {
        const newBookmark = {
          title: 'test-title',
          url: 'https://test.com',
          description: 'test description',
          rating: '1',
        }
        return supertest(app)
          .post(`/bookmarks`)
          .send(newBookmark)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(201)
          .expect(res => {
            expect(res.body.title).to.eql(newBookmark.title)
            expect(res.body.url).to.eql(newBookmark.url)
            expect(res.body.description).to.eql(newBookmark.description)
            expect(res.body.rating).to.eql(newBookmark.rating)
            expect(res.body).to.have.property('id')
            expect(res.headers.location).to.eql(`/bookmarks/${res.body.id}`)
          })
          .then(res =>
            supertest(app)
              .get(`/bookmarks/${res.body.id}`)
              .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
              .expect(res.body)
          )
      })

      it('removes XSS attack content from response', () => {
        const { maliciousBookmark, expectedBookmark } = makeMaliciousBookmark()
        return supertest(app)
          .post(`/bookmarks`)
          .send(maliciousBookmark)
          .set('Authorization', `Bearer ${process.env.API_TOKEN}`)
          .expect(201)
          .expect(res => {
            expect(res.body.title).to.eql(expectedBookmark.title)
            expect(res.body.description).to.eql(expectedBookmark.description)
          })
      })
    })
})